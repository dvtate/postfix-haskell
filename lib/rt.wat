(module
    {{USER_IMPORTS}}

    ;; Memory export
    (memory (export "m") {{PAGES_NEEDED}})

    ;; Reference stack pointer (0 - 1,000,000)
    (global $__ref_sp (mut i32) (i32.const {{STACK_SIZE}}))

    ;; Push a pointer onto the reference stack
    (func $__ref_stack_push (param $ptr i32)
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
    (data (i32.const {{STACK_SIZE}}) "{{STATIC_DATA_STR}}")

    ;; Initialize nursery head
    ;; (data (i32.const {{NURSERY_SP_INIT}}) "\00\00\00\00" "\00\00\00\00" "\00\00\00\00")

    ;; Nursery stack pointer
    (global $__nursery_sp (mut i32) (i32.const {{NURSERY_SP_INIT}}))

    ;; Does the given pointer fall within the region of the nursery?
    (func $__in_nursery (param $ptr i32) (result i32)
        ;; OPTIMIZATION single compare, don't need to worry about lhs
        local.get $ptr
        i32.const 213121
        i32.ge_u
        local.get $ptr
        i32.const 123123
        i32.lt_u
        i32.and
    )

    ;; Heap start
    (global $__heap_start i32
        (i32.const {{HEAP_START}}))

    ;; Initialize heap head
    (data
        (i32.const {{HEAP_START}})
        "\00\00\00\00" "\00\00\00\00" "\00\00\00\00")

    ;; Initialize last item stored on the heap
    (global $__heap_tail (mut i32)
        (i32.const {{HEAP_START}}))

    ;; Initialize last free space
    (global $__free_head (mut i32) (i32.const {{FREE_START}}))
    (data (i32.const {{FREE_START}}) "{{INIT_FREE_SIZE_STR}}")

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
            i32.const {{NURSERY_SIZE}}
            i32.const 16384
            i32.sub ;; nursery size - useful space - 12 - 12
            i32.gt_u
            if
                ;; Allocate it onto the heap, not the nursery
                (return (call $__alloc_heap
                    (local.get $size)
                    (local.get $ref_bitfield_addr)))
            else
                ;; Empty the nursery to make room
                call $__minor_gc
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
                i32.shr_u       ;; / 32
                local.get $m_bf_addr
                i32.add
                i64.load
                local.set $bf_cursor
            end

            ;; If bit indicates a reference
            i64.const 0x1000000000000000
            local.get $local_ind
            i64.extend_i32_u
            i64.shr_u
            local.get $bf_cursor
            i64.and
            i64.popcnt
            i32.wrap_i64 ;; optimize?
            if
                ;; Mark referenced pointer
                local.get $bit_ind
                i32.const 3
                i32.shr_u
                local.get $user_ptr
                i32.add
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
            if
                br $for_each_bit
            end
        )
    )

    ;; Allocate an object onto the heap
    ;; Note this also copies the given mark if included in size-bf
    ;; Note that size is measured in multiples of 32 bits
    ;; Note that returns start of header object instead of user pointer (add 12)
    (func $__alloc_heap (param $mark_size i32) (param $bf_ptr i32) (result i32)
        (local $free_p i32)         ;; current gc_heap_empty_t*
        (local $free_v i64)         ;; value stored in free_p
        (local $last_free_p i32)    ;; previous value of free_p or 0 if first
        (local $delta i32)          ;; multipurpose, difference
        (local $next i32)           ;; copy next pointer before overwriting it
        (local $just_size i32)      ;; Size without the mark + size of object header

        ;; Align to nearest 64 bits (obj header is 96)
        local.get $mark_size
        i32.const 0x1
        i32.or
        local.tee $mark_size

        ;; Extract size + header
        i32.const 0x3fffffff
        i32.and
        i32.const 12
        i32.add
        local.set $just_size

        ;; Start at start of free-list
        global.get $__free_head
        ;; local.tee $last_free_p
        local.set $free_p

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
                    ;; last_free_p = free_p
                    local.get $free_p
                    local.set $last_free_p

                    ;; free_p = free_v.next
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
                i32.const 16384     ;; (1024 B/KiB * 64 KiB/page) / 8 B/i32
                i32.div_u
                i32.const 1
                i32.add             ;; guarantee there's always some free space at the end
                local.tee $delta    ;;
                memory.grow
                i32.const -1
                i32.eq
                if
                    unreachable ;; failed to get more memory -> panic
                end

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
                return

            else ;; Small enough for this free space
                ;; Store leftover space into delta
                local.get $free_v
                i64.const 32
                i64.shr_u
                i32.wrap_i64
                local.get $just_size
                i32.sub
                local.set $delta

                ;; Update heap tail
                global.get $__heap_tail
                local.get $free_p
                i32.store offset=8
                local.get $free_p
                global.set $__heap_tail

                ;; Copy next pointer
                local.get $free_p
                i32.load offset=4
                local.set $next

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

                local.get $delta
                if
                    ;; leftover space

                    ;; Write new free space head
                    ;; (free_p = free_p + just_size)->size = delta
                    local.get $free_p
                    local.get $just_size
                    i32.add
                    local.tee $free_p
                    local.get $delta
                    i32.store
                    ;; free_p->next = next
                    local.get $free_p
                    local.get $next
                    i32.store

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
                        ;; TODO calculate this via free_p instead
                        memory.size
                        i32.const 65536
                        i32.div_u
                        i32.const 8
                        i32.sub
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

                local.get $free_p
                return
            end
        )
        unreachable
    )

    ;; note that len is in multiples of 32 bits
    (func $memcpy32 (param $dest i32) (param $src i32) (param $len i32)
    )


    (func $__update_refs (param $addr i32)

    )

    ;; GC the nursery
    (func $__minor_gc
        (local $p i32)          ;; stack pointer
        (local $obj i64)        ;; header object value
        (local $dest i32)       ;; pointer to where object is being moved

        ;; Mark

        ;; p = end of reference stack
        global.get $__ref_sp
        local.tee $p

        ;; if p == reference stack pointer
        i32.const {{STACK_SIZE}}
        i32.eq
        if  ;; stack is empty -> everything is garbage (wtf)
            ;; TODO also empty main heap
            i32.const {{NURSERY_SP_INIT}}
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

        ;; Move shit to the main heap

        ;; Iterate over items in the nursery
        global.get $__nursery_sp
        local.set $p
        (loop $cp_loop
            ;; Load header
            local.get $p
            i64.load
            local.tee $obj

            ;; If marked
            i32.wrap_i64
            i32.const 0xc0000000
            i32.and
            if ;; Copy it into the main heap

                ;; Allocate space on heap
                local.get $obj
                i64.const 32
                i64.shr_u
                i32.wrap_i64
                local.get $obj
                i32.wrap_i64
                call $__alloc_heap
                i32.const 12
                i32.add
                local.set $dest

                ;; Store address into the next pointer
                local.get $p
                local.get $dest
                i32.store offset=8

                ;; memcpy user data
                local.get $dest
                local.get $p
                i32.const 12
                i32.add
                local.get $obj
                i32.wrap_i64
                i32.const 0x3fffffff
                i32.and
                call $memcpy32
            end

            ;; if (p = p + sizeof(obj_header_t) + p->size) < END_OF_NURSERY - sizeof(obj_header_t)
            local.get $p
            i32.const 12
            i32.add
            local.get $obj
            i32.wrap_i64
            i32.const 0x3fffffff
            i32.and
            i32.add
            local.tee $p
            i32.const {{NURSERY_SP_INIT}}
            i32.lt_u
            if
                br $cp_loop
            end
        )

        ;; Update references

        ;; Update stack refs
        ;; for each pointer on the references stack
        global.get $__ref_sp
        local.set $p
        (loop $rsu_loop
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
            if
                br $rsu_loop
            end
        )

        ;; Update references to objs previously stored in nursery
        call $__update_nursery_refs

        ;; Empty nursery: ie- allow overwrites
        i32.const {{NURSERY_SP_INIT}}
        global.set $__nursery_sp
    )

    ;; After minor gc, update references to values stored in the nursery
    ;; ideally would be inlined
    (func $__update_nursery_refs
        (local $p i32)          ;; pointer to head of current nursery obejct
        (local $obj i64)        ;; bf+mark+size values from object header
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
        (loop $cp_loop
            ;; Load header
            local.get $p
            i64.load
            local.tee $obj

            ;; If marked
            i32.wrap_i64
            i32.const 0xc0000000
            i32.and
            if
                ;; and if has a refs bf
                local.get $obj
                i64.const 32
                i64.shr_u
                i32.wrap_i64
                local.tee $bf
                if
                    ;; Get size
                    local.get $obj
                    i32.wrap_i64
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
                    (loop $rbf_loop
                        ;; First bit in an i64
                        local.get $i
                        i32.const 64
                        i32.rem_u
                        local.tee $local_ind
                        i32.eqz
                        if
                            ;; Load next 64 bits from bitfield
                            local.get $i
                            i32.const 5
                            i32.shr_u       ;; / 32
                            local.get $bf
                            i32.add
                            i64.load
                            local.set $bf_cursor
                        end

                        ;; If bit indicates reference
                        i64.const 0x1000000000000000
                        local.get $local_ind
                        i64.extend_i32_u
                        i64.shr_u
                        local.get $bf_cursor
                        i64.and
                        i64.popcnt
                        i32.wrap_i64 ;; TODO is this optimal?
                        if
                            ;; Load reference in object
                            ;; *(dest + i * 4) as i32
                            local.get $dest
                            local.get $i
                            i32.const 2
                            i32.shl
                            i32.add
                            i32.load
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
                                i32.load            ;; see __minor_gc for how this works

                                i32.store
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
                        if
                            br $rbf_loop
                        end
                    )
                end
            end

            ;; next p
            ;; if (p = p + sizeof(obj_header_t) + p->size) < END_OF_NURSERY - sizeof(obj_header_t)
            local.get $p
            i32.const 12
            i32.add
            local.get $obj
            i32.wrap_i64
            i32.const 0x3fffffff
            i32.and
            i32.add
            local.tee $p
            i32.const {{NURSERY_SP_INIT}}
            i32.lt_u
            if
                br $cp_loop
            end
        )
    )

    (func $__heap_free (param i32)
        ;;
    )


    ;; GC the main heap
    (func $__major_gc

    )

    ;; Coalesce free spaces
    (func $__coalesce
        (local $cur_ptr i32)
        global.get $__free_head
        local.set $cur_ptr
        ;; idk if this is gonna be realistic ngl
    )

    ;; (export "push_ref" (func $__ref_stack_push))
    ;; (export "pop_ref" (func $__ref_stack_pop))
    ;; (export "alloc" (func $__alloc_nursery))
    ;; (export "mark" (func $__mark))

    {{USER_CODE_STR}}
)