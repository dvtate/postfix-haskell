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
    (global $__free_head (mut i32) (i32.const {{STACK_SIZE+NURSERY_SIZE+STATIC_DATA_LEN+OBJ_HEAD_SIZE}}))
    (data (i32.const {{STACK_SIZE+NURSERY_SIZE+STATIC_DATA_LEN+OBJ_HEAD_SIZE}})
        {{RESERVED_MEM-STACK_SIZE-NURSERY_SIZE-STATIC_DATA_LEN-OBJ_HEAD_SIZE}})
    ;; TODO need to initialize size to the entire rest of memory

    ;; Allocate an object in the nursery
    ;; Note that size is measured in multiples of 32 bits
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
        local.tee $m_bf_addr
        i32.eqz
        if  ;; No references (optimization)
            return
        end

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
    ;; Note this also copies the given mark
    ;; Note that size is measured in multiples of 32 bits
    (func $__alloc_heap (param $mark_size i32) (param $bf_ptr i32)
        (local $free_p i32)
        (local $free_v i64)
        (local $last_free_p i32)
        (local $delta i32)

        ;; Size without the mark added size of header
        (local $just_size i32)

        ;; Align to nearest 64 bits (obj header is 96)
        local.get $mark_size
        i32.const 0x1
        i32.or
        local.tee $mark_size

        ;; Extract size + header
        i32.const 0x00ffffff
        i32.and
        i32.const 12
        i32.add
        local.set $just_size

        ;; fuck from here down probably needs to be rewritten
        ;; Edge cases
        ;; - Empty list w/ memory growth
        ;; - Empty list w/ fit
        ;; - Empty list w/ perfect fit

        ;; Start at start of free-list
        global.get $__free_head
        local.tee $free_p
        local.set $last_free_p

        (loop $next_empty
            ;; (free_v = *free_ptr).size >= just_size
            local.get $free_p
            i64.load
            local.tee $free_v
            i64.const 32
            i64.shr_u
            i32.wrap_i64
            local.get $just_size
            i32.ge_u
            if ;; Too big for this free space
                ;; if (free_v.next == NULL)
                local.get $free_v
                i32.wrap_i64
                if ;; check to next node
                    local.get $free_p
                    local.set $last_free_p

                    local.get $free_v
                    i32.wrap_i64
                    local.set $free_p
                    br $next_empty
                end

                ;; Else: this is the last node

                ;; Expand linear memory to fill the gap
                local.get $just_size
                local.get $free_v
                i32.wrap_i64
                i32.sub
                i32.const 16384 ;; (1024 B/KiB * 64 KiB) / 8 B/i32
                i32.div_u
                i32.const 1
                i32.add         ;; guarantee there's always some free space at the end
                local.tee $delta
                memory.grow
                i32.const -1
                i32.eq
                if
                    unreachable ;; failed
                else

                ;; delta now stores the size of the free space that will remain after the object is allocated
                local.get $delta
                i32.const 16384
                i32.mul
                local.get $free_v
                i32.wrap_i64
                i32.add
                local.get $just_size
                i32.sub
                local.set $delta

                ;; Overwrite free object with our object header
                local.get $free_p
                local.get $bf_ptr
                i32.store
                local.get $free_p
                local.get $mark_size
                i32.store offset=4
                local.get $free_p
                i32.const 0
                i32.store offset=8

                ;; Make new excess space new free object in list
                local.get $free_p
                local.get $just_size
                i32.add
                local.tee
                local.get $delta
                i32.store
                local.get $free_p
                i32.const 0
                i32.store offset=4

                ;; Update last free item entry
                local.get $last_free_p
                local.get $free_p
                i32.store offset=4

            else ;; Small enough for this free space
            end
        )
    )

    ;; GC the nursery
    (func $__minor_gc
        (local $p i32)

        ;; Mark

        ;; p = end of reference stack
        global.get $__ref_sp
        local.tee $p

        ;; if p == reference stack pointer
        i32.const {{STACK_SIZE}}
        i32.eq
        if  ;; stack is empty -> everything is garbage (wtf)
            ;; TODO also empty main heap
            i32.const {{STACK_SIZE+NURSERY_SIZE-OBJ_HEAD_SIZE}}
            global.set $__nursery_sp
            return
        end

        ;; for each pointer on the references stack
        (loop $mark_loop
            ;; mark(*p)
            local.get $p
            i32.load
            call $__mark

            ;; do while (++p < end_of_stack)
            local.get $p
            i32.const 4
            i32.add
            local.tee $p
            i32.const {{STACK_SIZE}}
            i32.lt_u
            if
                br $mark_loop
            end
        )

        ;;
    )

    ;; GC the main heap
    (func $__major_gc


    )

    ;; Coalesce free spaces
    (func $__coalesce
        (local $cur_ptr i32)
        global.get $__free_head

    )


    (func $__in_nursery (param $ptr i32) (result i32)

    )

    (func $__max_addr (result i32)

    )
)