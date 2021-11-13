(module
    ;; Reference stack pointer (0 - 1,000,000)
    (global $__ref_sp (mut i32) {{STACK_SIZE}})

    ;; Push a pointer onto the reference stack
    (func $__ref_stack_push (param i32 $ptr)
        ;; Note we decrement for better cache efficiency
        ;; __ref_sp--
        (global.get $__ref_sp)
        (i32.const 4)
        (i32.sub)
        (global.set $__ref_sp)

        ;; *__ref_sp = ptr
        (global.get $__ref_sp)
        (local.get $ptr)
        (i32.store)
    )

    ;; Pop a pointer from the top of the reference stack
    (func $__ref_stack_pop (result i32)
        ;; ret = *__ref_sp
        (global.get $__ref_sp)
        (i32.load)

        ;; __ref_sp++
        (global.get $__ref_sp)
        (i32.const 4)
        (i32.add)
        (global.set $__ref_sp)

        ;; return ret
    )

    ;; Initialize static data
    (data (i32.const {{STACK_SIZE}}) {{STATIC_DATA}})

    ;; Initialize nursery head
    (data (i32.const {{STACK_SIZE+NURSERY_SIZE-OBJ_HEAD_SIZE}}) "\00\00\00\00" "\00\00\00\00" "\00\00\00\00")

    ;; Nursery stack pointer
    (global $__nursery_sp (mut i32)
        (i32.const {{STACK_SIZE+NURSERY_SIZE-OBJ_HEAD_SIZE}}))

    ;; Heap start
    (global $__heap_start i32
        (i32.const {{STACK_SIZE+NURSERY_SIZE+STATIC_DATA_LEN}}))

    ;; Initialize heap head
    (data
        (i32.const {{STACK_SIZE+NURSERY_SIZE+STATIC_DATA_LEN}})
        "\00\00\00\00" "\00\00\00\00" "\00\00\00\00")

    ;; Initialize last item stored on the heap
    (global $__heap_tail (mut i32) (global.get $__heap_start))

    ;; Initialize last free space
    (global $__free_head (mut i32) (i32.const {{STACK_SIZE+NURSERY_SIZE+STATIC_DATA_LEN+OBJ_HEAD_SIZE}})))
    (data (i32.const {{STACK_SIZE+NURSERY_SIZE+STATIC_DATA_LEN+OBJ_HEAD_SIZE}})
        {{STACK_SIZE+NURSERY_SIZE+STATIC_DATA_LEN+OBJ_HEAD_SIZE}})
    ;; TODO need to initialize size to the entire rest of memory

    ;; Allocate an object in the nursery
    (func $__alloc_nursery (param $size i32) (param $ref_bitfield_addr i32) (result i32)
        (local $new_nsp i32)

        ;; Check if we can fit it into the nursery
        ;; nursery_sp - (size + sizeof(obj_header)) < START_OF_NURSERY
        global.get $__nursery_sp        ;; last allocated object start
        i32.const 12                    ;; size of heap object header (3 x i32)
        local.get $size
        i32.add
        i32.sub
        local.tee $new_nsp
        i32.const {{STACK_SIZE}}        ;; start of nursery
        i32.lt_u
        if
            ;; Item too big to fit into an empty nursery
            local.get $size
            i32.const {{NURSERY_SIZE-16384}} ;; nursery size - useful space - 12 - 12
            i32.gt_u
            if
                ;; Allocate it onto the heap, not the nursery
                (return (call $__alloc_heap
                    local.get $size
                    local.get $ref_bitfield_addr))
            else
                ;; Empty the nursery to make room
                call $__minor_gc
            end
        end

        ;; Else: Perform allocation

        ;; nursery_sp->next = updated_nursery_sp
        global.get $__nursery_sp
        i32.const 8
        i32.add
        local.get $new_nsp
        i32.store

        ;; Update nsp
        local.get $new_nsp
        global.set $__nursery_sp

        ;; Initialize new header

        ;; nsp->bitfield = ref_bitfield_addr
        local.get $new_nsp
        local.get $ref_bitfield_addr
        i32.store

        ;; nsp->size = size
        local.get $new_nsp
        local.get $size
        i32.store offset=4

        ;; nsp->next = NULL
        local.get $new_nsp
        i32.const 0
        i32.store offset=8

        ;; Return the start of the payload
        ;; return (nsp + 1)
        local.get $new_nsp
        i32.const 12
        i32.add
    )

    ;; Marks user-provided memory address
    (func $__mark (param $user_ptr i32)
        ;; Pointer to the start of header object for $user_ptr
        (local $m_ptr i32)

        ;; Value of the mark member of header object
        (local $m_mark_size i32) ;; recycled: localized index of bit

        ;; Address of the references bitfield
        (local $m_bf_addr i32)

        ;; Locals for iterating over the references bitfield
        ;; Note: Initialized to 0
        (local $bit_ind i32)        ;; Current Bit in the references bitfield
        (local $bf_cursor i64)      ;; Scanned 64bit section of ref bitfield
        (local $local_ind i32)      ;; Index within the Scanned 64bit section

        ;; Get mark
        local.get $user_ptr
        i32.const 12
        i32.sub
        local.tee $m_ptr
        i32.load offset=4
        local.set $m_mark_size

        ;; If we've already visited, return
        local.get $m_mark_size
        i32.const 0xff000000
        i32.and
        if
            return
        end

        ;; Write mark
        local.get $m_ptr
        i32.const 0xff000000
        i32.or
        i32.store offset=4

        ;; Recursively iterate through bitfield references

        ;; Read bf addr
        local.get $m_ptr
        i32.load
        local.set $m_bf_addr

        (loop $for_each_bit
            ;; If it's the first bit in an i64
            local.get $bit_ind
            i32.const 64
            i32.rem_u
            local.tee $local_ind
            i32.eqz
            if
                ;; Load the next 64 bits from the bitfield
                local.get $bit_ind
                i32.const 5
                i32.shr_u
                local.get $m_bf_addr
                i32.add
                i64.load
                local.set $bf_cursor
            end

            ;; If bit indicates a reference
            i64.const 0x1000000000000000
            local.get $local_ind
            i64.shr_u
            i64.and
            if
                ;; Mark referenced pointer
                local.get $bit_ind
                i32.const 3
                i32.shr_u
                local.get $user_ptr
                i32.add
                call $__mark
            end

            ;; bit_ind++
            local.get $bit_ind
            i64.const 1
            i64.add
            local.set

            ;; Do while bit_ind < size
            ;; Remember that size is denoted as multiples of 32 bits
            ;; Note that the mark part in the local is always 0b00 (see: return)
            local.get $bit_ind
            local.get $m_mark_size
            i32.lt_u
            if
                br $for_each_bit
            end
        )
    )

    ;; Allocate an object onto the heap
    (func $__alloc_heap (param i32 i32)

    )

    ;; GC the nursery
    (func $__minor_gc )

    ;; GC the main heap
    (func $__major_gc )
)