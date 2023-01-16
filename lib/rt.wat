(module
    ;; Imported functions from the host
    {{USER_IMPORTS}}

    ;; Function reference table
    {{USER_TABLE}}

    ;; Memory export
    (memory (export "__memory") {{PAGES_NEEDED}})

    ;; Reference stack pointer
    (global $__ref_sp (mut i32) (i32.const {{STACK_END}}))

    ;; Reference variables stack pointer
    (global $__rv_sp (mut i32) (i32.const {{RV_STACK_END}}))

    ;; Push a pointer onto the reference stack
    (func $__ref_stack_push (param $ptr i32)
        ;; Note decrement for better cache efficiency
        ;; __ref_sp--
        global.get $__ref_sp
        i32.const 4
        i32.sub
        global.set $__ref_sp

        ;; *__ref_sp = ptr
        global.get $__ref_sp
        local.get $ptr
        i32.store
    )

    ;; Pop a pointer from the top of the reference stack
    (func $__ref_stack_pop (result i32)
        ;; ret = *__ref_sp
        global.get $__ref_sp
        i32.load

        ;; __ref_sp++
        global.get $__ref_sp
        i32.const 4
        i32.add
        global.set $__ref_sp

        ;; return ret
    )

    ;; Instead functions allocate chunks of known sizes based on needs
    ;; ;; Store a reference on the rv stack
    ;; (func $__rv_stack_push (result i32)
    ;;     ;; return *(--__rv_sp) = ref_stack_pop()

    ;;     global.get $__rv_sp
    ;;     i32.const 4
    ;;     i32.sub
    ;;     global.set $__rv_sp

    ;;     global.get $__rv_sp
    ;;     call $__ref_stack_pop
    ;;     i32.store

    ;;     global.get $__ref_sp
    ;; )

    ;; ;; Pop N references from the rv stack
    ;; (func $__rv_stack_pop (param $n i32)
    ;;     ;; __rv_sp += 4*n
    ;;     global.get $__rv_sp
    ;;     local.get $n
    ;;     i32.const 2
    ;;     i32.shl
    ;;     i32.add
    ;;     global.set $__rv_sp
    ;; )

    ;; Initialize static data
    (data (i32.const {{STACK_SIZE}}) "{{STATIC_DATA_STR}}")

    ;; Initialize nursery head
    ;; (data (i32.const {{NURSERY_SP_INIT}}) "\00\00\00\00" "\00\00\00\00" "\00\00\00\00")

    ;; Nursery stack pointer
    (global $__nursery_sp (mut i32) (i32.const {{NURSERY_SP_INIT}}))

    ;; Does the given pointer fall within the region of the nursery?
    (func $__in_nursery (param $ptr i32) (result i32)
        ;; OPTIMIZATION single compare, don't need to worry about lhs check
        local.get $ptr
        i32.const {{NURSERY_START}}
        i32.ge_u
        local.get $ptr
        i32.const {{NURSERY_END}}
        i32.lt_u
        i32.and
    )

    ;; Heap start
    (global $__heap_start i32
        (i32.const {{HEAP_START}}))

    ;; Initialize heap head
    ;; (data
    ;;     (i32.const {{HEAP_START}})
    ;;     "\00\00\00\00" "\00\00\00\00" "\00\00\00\00")

    ;; Initialize last item stored on the heap
    (global $__heap_tail (mut i32) (i32.const {{HEAP_START}}))

    ;; Initialize last free space
    (global $__free_head (mut i32) (i32.const {{FREE_START}}))
    (data (i32.const {{FREE_START}}) "{{INIT_FREE_SIZE_STR}}")

    ;; Allocate an object (w/ preference to nursery)
    ;; Note that size is measured in multiples of 32 bits
    (func $__alloc (param $size i32) (param $ref_bitfield_addr i32) (result i32)
        (local $new_nsp i32)

        ;; Check if we can fit it into the nursery
        ;; nursery_sp - (size + sizeof(obj_header)) < START_OF_NURSERY
        global.get $__nursery_sp        ;; last allocated object start
        i32.const 12                    ;; size of heap object header (3 x i32)
        local.get $size
        i32.const 2
        i32.shl
        i32.add
        i32.sub
        local.tee $new_nsp
        i32.const {{NURSERY_START}}        ;; start of nursery
        i32.lt_u
        if
            ;; Item too big to fit into an empty nursery
            local.get $size
            i32.const {{NURSERY_SIZE}}
            i32.const 1
            i32.shr_u ;; 50% of nursery => put it in the heap
            i32.gt_u
            if
                ;; Allocate it onto the heap, not the nursery
                (return (call $__alloc_heap
                    (local.get $size)
                    (local.get $ref_bitfield_addr)))
            else
                ;; Empty the nursery to make room
                call $__do_gc

                local.get $size
                local.get $ref_bitfield_addr
                call $__alloc
                return
            end
        end

        ;; Else: Perform allocation

        ;; nursery_sp->next = updated_nursery_sp
        global.get $__nursery_sp
        local.get $new_nsp
        i32.store offset=8

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
        ;; return (nsp + sizeof(header))
        local.get $new_nsp
        i32.const 12
        i32.add
    )

    ;; Marks user-provided memory address
    ;; Note this means user cannot have objects stored in static memory
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

        ;; check nullptr
        local.get $user_ptr
        i32.eqz
        if
            return
        end

        ;; Get mark
        local.get $user_ptr
        i32.const 12
        i32.sub
        local.tee $m_ptr
        i32.load offset=4
        local.set $m_mark_size

        ;; If we've already visited, return
        local.get $m_mark_size
        i32.const 0xc0000000
        i32.and
        if
            return
        end

        ;; Write mark
        local.get $m_ptr
        local.get $m_mark_size
        i32.const 0xc0000000
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

        loop $for_each_bit
            ;; If it's the first bit in an i64
            local.get $bit_ind
            i32.const 64
            i32.rem_u
            local.tee $local_ind
            i32.eqz
            if
                ;; Load the next 64 bits from the bitfield
                local.get $bit_ind
                i32.const 3
                i32.shr_u       ;; 64 / 8 *
                local.get $m_bf_addr
                i32.add
                i64.load
                local.set $bf_cursor
            end

            ;; If bit indicates a reference
            i64.const 0x1
            local.get $local_ind
            i32.const 7
            i32.xor                 ;; wasm is little endian
            i64.extend_i32_u
            i64.shl
            local.get $bf_cursor
            i64.and
            i64.eqz
            i32.eqz ;; convert i64 to boolean -> !!
            if
                ;; Mark referenced pointer
                local.get $bit_ind
                i32.const 2
                i32.shl
                local.get $user_ptr
                i32.add
                i32.load
                call $__mark
            end

            ;; Do while ++bit_ind < size
            ;; Remember that size is denoted as multiples of 32 bits
            ;; Note that the mark part in the local is always 0b00 (see: return)
            local.get $bit_ind
            i32.const 1
            i32.add
            local.tee $bit_ind
            local.get $m_mark_size
            i32.lt_u
            br_if $for_each_bit
        end
    )

    ;; Identical to mark except it ignores pointers which aren't in the nursery
    (func $__minor_mark (param $user_ptr i32)
        ;; Pointer to the start of header object for $user_ptr
        (local $m_ptr i32)

        ;; Value of the mark member of header object
        (local $m_mark_size i32) ;; recycled: localized index of bit

        ;; Address of the references bitfield
        (local $m_bf_addr i32)

        ;; Locals for iterating over the references bitfield
        ;; Note: Initialized to 0
        (local $bit_ind i32)    ;; Current Bit in the references bitfield
        (local $bf_cursor i64)  ;; Scanned 64bit section of ref bitfield
        (local $local_ind i32)  ;; Index within the Scanned 64bit sectio

        ;; check nullptr
        local.get $user_ptr
        i32.eqz
        if
            return
        end

        ;; Skip pointers not in nursery
        local.get $user_ptr
        call $__in_nursery
        i32.eqz
        if
            return
        end

        ;; Get mark
        local.get $user_ptr
        i32.const 12
        i32.sub
        local.tee $m_ptr
        i32.load offset=4
        local.set $m_mark_size

        ;; If we've already visited, return
        local.get $m_mark_size
        i32.const 0xc0000000
        i32.and
        if
            return
        end

        ;; Write mark
        local.get $m_ptr
        local.get $m_mark_size
        i32.const 0xc0000000
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

        loop $for_each_bit
            ;; If it's the first bit in an i64
            local.get $bit_ind
            i32.const 64
            i32.rem_u
            local.tee $local_ind
            i32.eqz
            if
                ;; Load the next 64 bits from the bitfield
                local.get $bit_ind
                i32.const 3
                i32.shr_u       ;; 64 / 8 *
                local.get $m_bf_addr
                i32.add
                i64.load
                local.set $bf_cursor
            end

            ;; If bit indicates a reference
            i64.const 0x1
            local.get $local_ind
            i32.const 7
            i32.xor                 ;; wasm is little endian
            i64.extend_i32_u
            i64.shl
            local.get $bf_cursor
            i64.and
            i64.eqz
            i32.eqz ;; convert i64 to boolean -> !!
            if
                ;; Mark referenced pointer (DFS)
                local.get $bit_ind
                i32.const 2
                i32.shl       ;; * sizeof(i32)
                local.get $user_ptr
                i32.add
                i32.load
                call $__minor_mark
            end

            ;; Do while ++bit_ind < size
            ;; Remember that size is denoted as multiples of 32 bits
            ;; Note that the mark part in the local is always 0b00 (see: return)
            local.get $bit_ind
            i32.const 1
            i32.add
            local.tee $bit_ind
            local.get $m_mark_size
            i32.le_u
            br_if $for_each_bit
        end
    )

    ;; Allocate an object onto the heap
    ;; Note this also copies the given mark if included in size-bf
    ;; Note that size is measured in multiples of 32 bits
    (func $__alloc_heap (param $mark_size i32) (param $bf_ptr i32) (result i32)
        (local $free_p i32)         ;; current gc_heap_empty_t*
        (local $f_size i32)         ;; value of size field in free_p
        (local $f_next i32)         ;; pointer to next freespace in free_p
        (local $last_free_p i32)    ;; previous value of free_p or 0 if first
        (local $delta i32)          ;; multipurpose, difference
        (local $next i32)           ;; copy next pointer before overwriting it
        (local $just_size i32)      ;; Size without the mark + size of object header

        ;; Align to nearest 64 bits (obj header is 96)
        local.get $mark_size
        i32.const 0x1
        i32.or
        i32.const 0x3fffffff
        i32.and
        local.tee $mark_size

        ;; Extract size + header
        ;; i32.const 2
        ;; i32.shl ;; * 4 (i32 -> bytes)
        i32.const 3
        i32.add
        local.set $just_size

        ;; Start at start of free-list
        global.get $__free_head
        ;; local.tee $last_free_p
        local.set $free_p

        loop $next_empty
            ;; (free_v = *free_ptr).size >= just_size
            ;; read freespace header
            local.get $free_p
            i32.load
            local.set $f_size
            local.get $free_p
            i32.load offset=4
            local.set $f_next

            ;; Check if it fits
            local.get $just_size
            local.get $f_size
            i32.ge_u
            if ;; Too big for this free space
                ;; if (free_p->next == NULL)
                local.get $f_next
                if ;; check to next node
                    ;; last_free_p = free_p
                    local.get $free_p
                    local.set $last_free_p

                    ;; free_p = free_p->next
                    local.get $f_next
                    local.set $free_p

                    ;; maybe this one is big enough
                    br $next_empty
                end

                ;; Else: this is the last node

                ;; Expand linear memory to fill the gap
                local.get $just_size
                local.get $f_size
                i32.sub
                i32.const 14
                i32.shr_u           ;; / ((1024 B/KiB * 64 KiB/page) / 4 B/i32)
                i32.const 1
                i32.add             ;; guarantee there's always some free space at the end
                local.tee $delta

                memory.grow
                i32.const -1
                i32.eq
                if
                    unreachable ;; failed to get more memory -> panic
                end

                ;; delta now stores the size of the free space that will remain
                ;; after the object is allocated
                local.get $delta
                i32.const 14
                i32.shl             ;; pages -> # i32's
                local.get $f_size
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

                ;; Update heap tail
                global.get $__heap_tail
                local.get $free_p
                i32.store offset=8
                local.get $free_p
                global.set $__heap_tail

                ;; Make new excess space new free object in list
                ;; *(free_p = free_p + just_size) = gc_heap_empty_t { .size=delta, .next=NULL }
                local.get $free_p
                local.get $just_size
                i32.const 2
                i32.shl         ;; * sizeof(i32)
                i32.add
                local.tee $free_p
                local.get $delta
                i32.store
                local.get $free_p
                i32.const 0
                i32.store offset=4

                ;; Update last free item entry
                local.get $last_free_p
                if
                    ;; new end of list
                    local.get $last_free_p
                    local.get $free_p
                    i32.store offset=4
                else
                    ;; new start of list
                    local.get $free_p
                    global.set $__free_head
                end

                global.get $__heap_tail
                i32.const 12
                i32.add
                return

            else ;; Small enough for this free space
                ;; Store leftover space into delta
                ;; delta = (free_size - just_size)
                local.get $f_size
                local.get $just_size
                i32.sub
                local.set $delta

                ;; Copy next pointer
                ;; next = free_p->next
                local.get $free_p
                i32.load offset=4
                local.set $next

                ;; Overwrite free object with our object header
                ;; free_p now refers to heap_object_header_t*
                ;; free_p->refs_bitfield_addr = bf_addr
                ;; free_p->mark_size = mark_size
                ;; free_p->next = 0
                local.get $free_p
                local.get $bf_ptr
                i32.store
                local.get $free_p
                local.get $mark_size
                i32.store offset=4
                local.get $free_p
                i32.const 0
                i32.store offset=8

                ;; Add object to LL
                ;; heap_tail->next = free_p
                ;; heap_tail = free_p
                global.get $__heap_tail
                local.get $free_p
                i32.store offset=8
                local.get $free_p
                global.set $__heap_tail

                ;; Check leftover space
                local.get $delta
                if
                    ;; leftover space

                    ;; Write new free space head
                    ;; (free_p = free_p + just_size * sizeof(i32))->size = delta
                    local.get $free_p
                    local.get $just_size
                    i32.const 2
                    i32.shl         ;; * sizeof(i32)
                    i32.add
                    local.tee $free_p
                    local.get $delta
                    i32.store

                    ;; free_p->next = next
                    local.get $free_p
                    local.get $next
                    i32.store offset=4

                    ;; Maintain LL
                    local.get $last_free_p
                    if
                        local.get $last_free_p
                        local.get $free_p
                        i32.store offset=4
                    else
                        local.get $free_p
                        global.set $__free_head
                    end
                else
                    ;; no leftover space
                    local.get $last_free_p
                    if  ;; Make previous freespace new free list head
                        local.get $last_free_p
                        local.get $next
                        i32.store offset=4
                    else ;; We have exactly populated the heap
                        ;; Grow memory to make a new freespace
                        ;; Put the new free head at end of lm
                        ;; TODO calculate this via free_p instead?
                        memory.size
                        i32.const 16
                        i32.shl ;; * bytes/page
                        global.set $__free_head

                        ;; Extend lm by page (64 KiB)
                        i32.const 1
                        memory.grow
                        i32.const -1
                        i32.eq
                        if
                            unreachable ;; panic: failed
                        end

                        ;; Store the size of new free space
                        global.get $__free_head
                        i32.const 16384 ;; 1024 B/KiB * 64KiB/page / 4 B/I32
                        i32.store
                    end
                end

                global.get $__heap_tail
                i32.const 12
                i32.add
                return
            end
        end
        unreachable
    )

    ;; Similar to memcpy but works in multiples of 32 bits for improved performance
    ;; note that len is in multiples of 32 bits
    ;; could maybe optimize by using a 64 bit read head but eh
    (func $memcpy32 (param $dest i32) (param $src i32) (param $len i32)
        local.get $len
        if
            ;; len = len * 4 + dest
            local.get $dest
            local.get $len
            i32.const 2
            i32.shl
            i32.add
            local.set $len

            loop $cp_loop
                ;; *dest = *src
                local.get $dest
                local.get $src
                i32.load
                i32.store

                ;; src++; dest++
                local.get $src
                i32.const 4
                i32.add
                local.set $src
                local.get $dest
                i32.const 4
                i32.add
                local.tee $dest

                ;; Do while dest < len
                local.get $len
                i32.lt_u
                br_if $cp_loop
            end $cp_loop
        end
    )

    ;; increments each time we do gc
    (global $__gc_cycle (mut i32) (i32.const 0))

    ;; Collect Garbage
    (; TODO lots of room for optimization for minor gc/nursery
    - don't need next ptr
    ;)
    (func $__do_gc
        (local $p i32)          ;; stack pointer
        (local $dest i32)       ;; pointer to where object is being moved
        (local $is_major i32)   ;; is this gc a major gc?
        (local $mark_size i32)  ;; mark+size fields
        (local $bf i32)         ;; bitfield addres

        ;; Mark

        ;; p = end of reference stack
        global.get $__ref_sp
        local.tee $p

        ;; If there's nothing to mark, delete everything
        ;; if p == reference stack end && rv_sp == ref vars stack end
        i32.const {{STACK_SIZE}}
        i32.eq
        global.get $__rv_sp
        i32.const {{RV_STACK_END}}
        i32.eq
        i32.and
        if  ;; stack is empty -> everything is garbage
            ;; Reset globals
            i32.const {{NURSERY_SP_INIT}}
            global.set $__nursery_sp
            i32.const {{HEAP_START}}
            global.set $__heap_tail
            i32.const {{FREE_START}}
            global.set $__free_head

            ;; heap_start->next = null
            i32.const {{HEAP_START}}
            i32.const 0
            i32.store offset=8

            ;; free_start->size = (free_start - (memory.size * PAGE_SIZE)) / sizeof(i32)
            i32.const  {{FREE_START}}
            memory.size
            i32.const 16
            i32.shl
            i32.const {{FREE_START}}
            i32.sub
            i32.const 2
            i32.shr_u
            i32.store

            ;; free_start->next = null
            i32.const {{FREE_START}}
            i32.const 0
            i32.store offset=4
            return
        end

        ;; is_major = (++gc_cycle) % GEN_RATIO == 0
        global.get $__gc_cycle
        i32.const 1
        i32.add
        global.set $__gc_cycle
        global.get $__gc_cycle
        i32.const 4             ;; TODO tune this
        i32.rem_u
        i32.eqz
        local.tee $is_major

        ;; for each pointer on the references stack
        if
            loop $mark_loop
                ;; mark(*p)
                local.get $p
                i32.load
                call $__mark

                ;; do while (++p < end_of_stack)
                local.get $p
                i32.const 4
                i32.add
                local.tee $p
                i32.const {{STACK_END}}
                i32.lt_u
                br_if $mark_loop
            end $mark_loop
        else
            loop $mark_loop
                ;; mark(*p)
                local.get $p
                i32.load
                call $__minor_mark

                ;; do while (++p < end_of_stack)
                local.get $p
                i32.const 4
                i32.add
                local.tee $p
                i32.const {{STACK_END}}
                i32.lt_u
                br_if $mark_loop
            end $mark_loop
        end

        ;; p = ref var stack pointer
        global.get $__rv_sp
        local.set $p

        ;; for each pointer on the ref var stack
        local.get $is_major
        if
            loop $mark_loop2
                ;; mark(*p)
                local.get $p
                i32.load
                call $__mark

                ;; do while (++p < end_of_stack)
                local.get $p
                i32.const 4
                i32.add
                local.tee $p
                i32.const {{RV_STACK_END}}
                i32.lt_u
                br_if $mark_loop2
            end $mark_loop2
        else
            loop $mark_loop2
                ;; mark(*p)
                local.get $p
                i32.load
                call $__minor_mark

                ;; do while (++p < end_of_stack)
                local.get $p
                i32.const 4
                i32.add
                local.tee $p
                i32.const {{RV_STACK_END}}
                i32.lt_u
                br_if $mark_loop2
            end $mark_loop2
        end

        ;; If major gc, sweep the heap before emptying the nursery
        local.get $is_major
        if
            global.get $__heap_start
            local.tee $p

            ;; Note that the head object does not get freed and always has size zero
            i32.const 0xc0000000
            i32.store offset=4

            ;; $dest is used as $prev in this branch
            ;; it's initialized to null

            ;; for each object in the heap
            loop $sweep
                ;; if unmarked
                local.get $p
                i32.load offset=4
                local.tee $mark_size
                i32.const 0xc0000000
                i32.and
                i32.eqz
                if
                    ;; Free it
                    local.get $p
                    local.get $dest
                    call $__heap_free

                    ;; Go next
                    local.get $dest
                    i32.load offset=8
                    local.tee $p
                    br_if $sweep
                else
                    ;; Remove mark
                    local.get $p
                    local.get $mark_size
                    i32.const 0x3fffffff
                    i32.and
                    i32.store offset=4
                end

                ;; Do while ((p = (dest = p)->next) != 0)
                local.get $p
                local.tee $dest
                i32.load offset=8
                local.tee $p
                br_if $sweep
            end $sweep

            ;; Coalese adjacent free spaces
            call $__coalesce
        end

        ;; Move marked stuff from nursery to the main heap

        ;; Iterate over items in the nursery
        global.get $__nursery_sp
        local.set $p
        loop $cp_loop
            ;; Load header
            local.get $p
            i32.load
            local.set $bf
            local.get $p
            i32.load offset=4
            local.tee $mark_size

            ;; If marked
            i32.const 0xc0000000
            i32.and
            if ;; Copy it into the main heap
                ;; Allocate space on heap
                local.get $mark_size
                i32.const 0x3fffffff
                i32.and
                local.get $bf
                call $__alloc_heap
                local.set $dest

                ;; Store address into the next pointer field
                local.get $p
                local.get $dest
                i32.store offset=8

                ;; memcpy user data
                local.get $dest

                local.get $p
                i32.const 12
                i32.add

                local.get $mark_size
                i32.const 0x3fffffff
                i32.and
                call $memcpy32
            end

            ;; if (p = p + sizeof(obj_header_t) + p->size) < END_OF_NURSERY - sizeof(obj_header_t)
            local.get $p
            i32.const 12
            i32.add
            local.get $mark_size
            i32.const 0x3fffffff
            i32.and
            i32.const 2
            i32.shl
            i32.add
            local.tee $p
            i32.const {{NURSERY_SP_INIT}}
            i32.lt_u
            br_if $cp_loop
        end $cp_loop

        ;; Update references

        ;; Update stack refs
        ;; for each pointer on the references stack
        global.get $__ref_sp
        local.set $p
        loop $rsu_loop
            local.get $p
            i32.load
            local.tee $dest
            call $__in_nursery
            if
                ;; Update reference to new location
                local.get $p
                local.get $dest
                i32.const 4
                i32.sub
                i32.load
                i32.store
            end

            ;; do while (++p < end_of_stack)
            local.get $p
            i32.const 4
            i32.add
            local.tee $p
            i32.const {{STACK_SIZE}}
            i32.lt_u
            br_if $rsu_loop
        end $rsu_loop

        ;; Update references to objs previously stored in nursery
        call $__update_nursery_refs

        ;; Empty nursery: ie- allow overwrites
        i32.const {{NURSERY_SP_INIT}}
        global.set $__nursery_sp
    )

    ;; (func (export "heapLen") (result i32)
    ;;     (local $ret i32)
    ;;     (local $p i32)

    ;;     global.get $__heap_start
    ;;     local.set $p

    ;;     loop $iter_ll
    ;;         local.get $p
    ;;         i32.eqz
    ;;         if
    ;;             local.get $ret
    ;;             return
    ;;         end
    ;;         local.get $ret
    ;;         i32.const 1
    ;;         i32.add
    ;;         local.set $ret
    ;;         local.get $p
    ;;         i32.load offset=8
    ;;         local.set $p

    ;;         br $iter_ll
    ;;     end $iter_ll
    ;;     unreachable
    ;; )

    ;; After minor gc, update references to values stored in the nursery
    ;; TODO ideally would be inlined within do_gc
    ;; TODO this should instead operate on the nursery values before memcpy to heap
    (func $__update_nursery_refs
        (local $p i32)          ;; pointer to head of current nursery object
        (local $mark_size i32)  ;; mark-size field
        (local $size i32)       ;; size extracted
        (local $dest i32)       ;; where object p has been relocated to
        (local $bf i32)         ;; pointer to the ref bitfield of p
        (local $i i32)          ;; bit index within ref bitfield of p
        (local $bf_cursor i64)  ;; read head for bitfield
        (local $local_ind i32)  ;; index within current bf_cursor
        (local $check_ptr i32)  ;; tmp: pointer we're checking and updating

        ;; Algorithm:
        ;; for each object in nursery:
            ;; if marked && has refs bf:
                ;; for each child reference (according to refs bf):
                    ;; if in nursery:
                        ;; read translation address from nursery
                        ;; update value

        ;; maybe replace this with `block`s?

        ;; For each pointer p in nursery
        global.get $__nursery_sp
        local.set $p
        loop $cp_loop
            ;; Load header
            local.get $p
            i32.load
            local.set $bf
            local.get $p
            i32.load offset=4
            local.tee $mark_size

            ;; If marked
            i32.const 0xc0000000
            i32.and
            if
                ;; and if has a refs bf
                local.get $bf
                if
                    ;; Get size
                    local.get $mark_size
                    i32.const 0x3fffffff
                    i32.and
                    local.set $size

                    ;; Get updated address
                    local.get $p
                    i32.load offset=8
                    local.set $dest

                    ;; Initialize i
                    i32.const 0
                    local.set $i

                    ;; Iterate over bitfield
                    loop $rbf_loop
                        ;; First bit in an i64
                        local.get $i
                        i32.const 64
                        i32.rem_u
                        local.tee $local_ind
                        i32.eqz
                        if
                            ;; Load next 64 bits from bitfield
                            local.get $i
                            i32.const 3
                            i32.shr_u       ;; 64 / 8 *
                            local.get $bf
                            i32.add
                            i64.load
                            local.set $bf_cursor
                        end

                        ;; If bit indicates reference
                        i64.const 0x1
                        local.get $local_ind
                        i32.const 7
                        i32.xor                 ;; wasm is little endian
                        i64.extend_i32_u
                        i64.shl
                        local.get $bf_cursor
                        i64.and
                        i64.eqz
                        i32.eqz ;; convert i64 to boolean -> !!
                        if
                            ;; Load reference in object
                            ;; *(dest + i * 4) as i32
                            local.get $i
                            i32.const 2
                            i32.shl
                            local.get $dest
                            i32.add
                            i32.load ;;offset=12 ;; skip past header
                            local.tee $check_ptr
                            call $__in_nursery
                            if
                                ;; Update pointer in the object
                                local.get $dest
                                local.get $i
                                i32.const 2
                                i32.shl
                                i32.add

                                local.get $check_ptr
                                i32.const 4
                                i32.sub
                                i32.load            ;; relocation addr stored in next ptr (see __do_gc)
                                i32.store ;;offset=12
                            end
                        end

                        ;; Do while ++i < size
                        ;; Remember that size is denoted as multiples of 32 bits
                        local.get $i
                        i32.const 1
                        i32.add
                        local.tee $i
                        local.get $size
                        i32.lt_u
                        br_if $rbf_loop
                    end
                end
            end

            ;; next p
            ;; if (p = p + sizeof(obj_header_t) + p->size * sizeof(i32))
            ;;      < END_OF_NURSERY - sizeof(obj_header_t)
            local.get $p
            i32.const 12
            i32.add
            local.get $mark_size
            i32.const 0x3fffffff
            i32.and
            i32.const 2
            i32.shl
            i32.add
            local.tee $p
            i32.const {{NURSERY_SP_INIT}}
            i32.lt_u
            br_if $cp_loop
        end $cp_loop
    )

    ;; Free an object from the heap
    ;; ptr = the object to free
    ;; prev = object that came before it in the objects LL
    (func $__heap_free (param $ptr i32) (param $prev i32)
        ;; Convert object into a freespace
        local.get $ptr
        local.get $ptr
        i32.load offset=4
        i32.const 3 ;; add size of object header
        i32.add
        i32.const 0x3fffffff
        i32.and     ;; remove mark
        i32.store
        local.get $ptr
        i32.const 0
        i32.store offset=4

        ;; Remove object from objects LL
        local.get $prev
        local.get $ptr
        i32.load offset=8
        i32.store offset=8

        ;; Add freespace to freespace ll
        global.get $__free_head
        local.get $ptr
        i32.store offset=4          ;; make current free head .next = new freespace
        local.get $ptr
        global.set $__free_head     ;; make current free head = new freespace
    )

    ;; Coalesce free spaces
    (func $__coalesce
        (local $p i32) ;; current pointer
        (local $next i32) ;; p -> next
        (local $size i32) ;; p -> size

        ;; Algorithm: O(N * log(N) + N)
        ;; 1. Merge sort free-list by memory address
            ;; Note this leaves __free_tail intact
        ;; 2. Iterate through free-list, mergeing adjacent blocks

        ;; Sort freelist by memory address
        call $___sort_freelist

        ;; Iterate through free list, Combine adjacent free regions
        global.get $__free_head
        local.set $p
        loop $walk
            ;; if (p + p->size === p->next)
            local.get $p
            local.get $p
            i32.load
            local.tee $size
            i32.add
            local.get $p
            i32.load offset=4
            local.tee $next
            i32.eq
            if
                ;; p->size = p->size + p->next->size
                local.get $p
                local.get $next
                i32.load
                local.get $size
                i32.add
                i32.store

                ;; p->next = p->next->next
                local.get $p
                local.get $next
                i32.load offset=4
                local.tee $next
                i32.store offset=4
            end

            ;; Repeat while ((p = p->next))
            local.get $next
            local.tee $p
            br_if $walk
        end $walk
    )

    ;; Merge-sort freelist such that elements are in order by memory address
    (func $___sort_freelist
        (local $list i32) ;; list head (always = $global.__free_head)
        (local $p i32) ;; merge list p
        (local $q i32) ;; merge list q
        (local $e i32) ;; element
        (local $tail i32) ;; end of the merged list
        (local $insize i32)
        (local $nmerges i32)
        (local $psize i32) ;; items left in p
        (local $qsize i32) ;; items left in q
        (local $i i32) ;; iterator

        global.get $__free_head
        local.set $list

        i32.const 1
        local.set $insize

        loop $pass
            local.get $list
            local.set $p       ;; p = list
            i32.const 0
            local.tee $list     ;; list = null
            local.tee $tail     ;; tail = null
            local.set $nmerges  ;; nmerges = 0

            loop $merge
                ;; There exists a merge to be done
                ;; nmerges++
                local.get $nmerges
                i32.const 1
                i32.add
                local.set $nmerges

                ;; step insize places along from p
                local.get $p
                local.set $q        ;; q = p
                i32.const 0
                local.set $psize    ;; psize = 0
                ;; for (i = 0; i < insize; i++)
                loop $step
                    ;; psize++
                    local.get $psize
                    i32.const 1
                    i32.add
                    local.set $psize
                    ;; if ((q = q->next))
                    local.get $q
                    i32.load offset=4
                    local.tee $q
                    if
                        ;; if (++i < insize) continue
                        local.get $i
                        i32.const 1
                        i32.add
                        local.tee $i
                        local.get $insize
                        i32.lt_u
                        br_if $step
                    end
                end

                ;; size of the 2 lists
                ;; qsize = insize
                local.get $insize
                local.set $qsize

                ;; merge the 2 lists
                ;; while (psize > 0 || (qsize > 0 && q))
                ;; =>  if (q ? qsize : psize) { do {...} while (...) }
                local.get $qsize
                local.get $psize
                local.get $q
                select
                if
                    loop $merge_loop
                        block $cond
                            block $take_p
                                block $take_q
                                    ;; Emptiness checks
                                    local.get $psize
                                    i32.eqz
                                    br_if $take_q
                                    local.get $qsize
                                    i32.eqz
                                    br_if $take_p
                                    local.get $q
                                    i32.eqz
                                    br_if $take_p

                                    ;; p <= q
                                    local.get $p
                                    local.get $q
                                    i32.le_u
                                    br_if $take_p

                                    ;; else: q < p
                                    ;; fall through to take from q
                                end
                                ;; take from q
                                ;; q = (e = q)->next; qsize--;
                                local.get $q
                                local.tee $e
                                i32.load offset=4
                                local.set $q
                                local.get $qsize
                                i32.const 1
                                i32.sub
                                local.set $qsize
                                br $cond
                            end
                            ;; take from p
                            ;; p = (e = p)->next; psize--;
                            local.get $p
                            local.tee $e
                            i32.load offset=4
                            local.set $p
                            local.get $psize
                            i32.const 1
                            i32.sub
                            local.set $psize
                        end

                        ;; add next element to merged list
                        local.get $tail
                        if
                            ;; tail->next = e
                            local.get $tail
                            local.get $e
                            i32.store offset=4
                        else
                            local.get $e
                            local.set $list
                        end
                        local.get $e
                        local.set $tail

                        ;; continue if ...
                        ;; psize > 0 || (qsize > 0 && q)
                        ;; =>  q ? qsize : psize
                        local.get $qsize
                        local.get $psize
                        local.get $q
                        select
                        br_if $merge_loop
                    end
                end

                ;; Now p&q have stepped `insize` places
                local.get $q
                local.set $p
            end

            ;; tail->next = NULL
            local.get $tail
            i32.const 0
            i32.store offset=4

            ;; finished when only one merge needed
            local.get $nmerges
            i32.const 1
            i32.le_u
            if
                ;; By design, neither of these should be modified
                ;; local.get $list
                ;; global.set $__free_head
                ;; local.get $tail
                ;; global.set $__free_tail
                return
            end

            ;; not done repeat merging 2x size lists
            ;; insize *= 2
            local.get $insize
            i32.const 1
            i32.shl
            local.set $insize

            ;; infinite loop
            br $pass
        end $pass
    )

    ;; Debugging
    ;; (export "push_ref" (func $__ref_stack_push))
    ;; (export "pop_ref" (func $__ref_stack_pop))
    ;; (export "alloc" (func $__alloc))
    ;; (export "alloch" (func $__alloc_heap))
    ;; (export "mark" (func $__mark))
    ;; (export "mmark" (func $__minor_mark))
    ;; (export "do_gc" (func $__do_gc))
    ;; (export "free" (func $__heap_free))
    ;; (export "coalesce" (func $__coalesce))

    {{USER_CODE_STR}}
)