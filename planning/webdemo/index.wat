(module
  (import "js" "contextFillRect" (func $import_0 (param i32 i32 i32 i32)))
  (import "js" "Math.random" (func $import_1 (result f32)))
  (import "js" "nextFrame" (func $import_2))
  (memory (;0;) 48)
  (export "m" (memory 0))
  (global $__ref_sp (mut i32) (i32.const 1024000))
  (func $__ref_stack_push (param $ptr i32)
    global.get 0
    i32.const 4
    i32.sub
    global.set 0
    global.get 0
    local.get 0
    i32.store)
  (func $__ref_stack_pop (result i32)
    global.get 0
    i32.load
    global.get 0
    i32.const 4
    i32.add
    global.set 0)
  (data (;0;) (i32.const 1024000) "\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\002\00\00\00\14\00\00\00\01\00\00\00\01\00\00\00")
  (global $__nursery_sp (mut i32) (i32.const 1548276))
  (func $__in_nursery (param $ptr i32) (result i32)
    local.get 0
    i32.const 213121
    i32.ge_u
    local.get 0
    i32.const 123123
    i32.lt_u
    i32.and)
  (global $__heap_start i32 (i32.const 3096592))
  (data (;1;) (i32.const 3096592) "\00\00\00\00\00\00\00\00\00\00\00\00")
  (global $__heap_tail (mut i32) (i32.const 3096592))
  (global $__free_head (mut i32) (i32.const 3096604))
  (data (;2;) (i32.const 3096604) "\e4\00\00\00")
  (func $__alloc_nursery (param $size i32) (param $ref_bitfield_addr i32) (result i32)
    (local $new_nsp i32)
    global.get 1
    i32.const 12
    local.get 0
    i32.add
    i32.sub
    local.tee 2
    i32.const 1024000
    i32.lt_u
    if  ;; label = @1
      local.get 0
      i32.const 524288
      i32.const 16384
      i32.sub
      i32.gt_u
      if  ;; label = @2
        local.get 0
        local.get 1
        call 8
        return
      else
        call 11
      end
    end
    global.get 1
    local.get 2
    i32.store offset=8
    local.get 2
    global.set 1
    local.get 2
    local.get 1
    i32.store
    local.get 2
    local.get 0
    i32.store offset=4
    local.get 2
    i32.const 0
    i32.store offset=8
    local.get 2
    i32.const 12
    i32.add)
  (func $__mark (param $user_ptr i32)
    (local $m_ptr i32) (local $m_mark_size i32) (local $m_bf_addr i32) (local $bit_ind i32) (local $bf_cursor i64) (local $local_ind i32)
    local.get 0
    i32.const 12
    i32.sub
    local.tee 1
    i32.load offset=4
    local.set 2
    local.get 2
    i32.const -1073741824
    i32.and
    if  ;; label = @1
      return
    end
    local.get 1
    local.get 2
    i32.const -1073741824
    i32.or
    i32.store offset=4
    local.get 1
    i32.load
    local.tee 3
    i32.eqz
    if  ;; label = @1
      return
    end
    loop $for_each_bit
      local.get 4
      i32.const 64
      i32.rem_u
      local.tee 6
      i32.eqz
      if  ;; label = @2
        local.get 4
        i32.const 5
        i32.shr_u
        local.get 3
        i32.add
        i64.load
        local.set 5
      end
      i64.const 1152921504606846976
      local.get 6
      i64.extend_i32_u
      i64.shr_u
      local.get 5
      i64.and
      i64.popcnt
      i32.wrap_i64
      if  ;; label = @2
        local.get 4
        i32.const 3
        i32.shr_u
        local.get 0
        i32.add
        call 7
      end
      local.get 4
      i32.const 1
      i32.add
      local.tee 4
      local.get 2
      i32.lt_u
      if  ;; label = @2
        br 1 (;@1;)
      end
    end)
  (func $__alloc_heap (param $mark_size i32) (param $bf_ptr i32) (result i32)
    (local $free_p i32) (local $free_v i64) (local $last_free_p i32) (local $delta i32) (local $next i32) (local $just_size i32)
    local.get 0
    i32.const 1
    i32.or
    local.tee 0
    i32.const 1073741823
    i32.and
    i32.const 12
    i32.add
    local.set 7
    global.get 4
    local.set 2
    loop $next_empty
      local.get 2
      i64.load
      local.tee 3
      i64.const 32
      i64.shr_u
      i32.wrap_i64
      local.get 7
      i32.ge_u
      if  ;; label = @2
        local.get 3
        i32.wrap_i64
        if  ;; label = @3
          local.get 2
          local.set 4
          local.get 3
          i32.wrap_i64
          local.set 2
          br 2 (;@1;)
        end
        local.get 7
        local.get 3
        i32.wrap_i64
        i32.sub
        i32.const 16384
        i32.div_u
        i32.const 1
        i32.add
        local.tee 5
        memory.grow
        i32.const -1
        i32.eq
        if  ;; label = @3
          unreachable
        end
        local.get 5
        i32.const 16384
        i32.mul
        local.get 3
        i32.wrap_i64
        i32.add
        local.get 7
        i32.sub
        local.set 5
        local.get 2
        local.get 1
        i32.store
        local.get 2
        local.get 0
        i32.store offset=4
        local.get 2
        i32.const 0
        i32.store offset=8
        global.get 3
        local.get 2
        i32.store offset=8
        local.get 2
        global.set 3
        local.get 2
        local.get 7
        i32.add
        local.tee 2
        local.get 5
        i32.store
        local.get 2
        i32.const 0
        i32.store offset=4
        local.get 4
        if  ;; label = @3
          local.get 4
          local.get 2
          i32.store offset=4
        else
          local.get 2
          global.set 4
        end
        global.get 3
        return
      else
        local.get 3
        i64.const 32
        i64.shr_u
        i32.wrap_i64
        local.get 7
        i32.sub
        local.set 5
        global.get 3
        local.get 2
        i32.store offset=8
        local.get 2
        global.set 3
        local.get 2
        i32.load offset=4
        local.set 6
        local.get 2
        local.get 1
        i32.store
        local.get 2
        local.get 0
        i32.store offset=4
        local.get 2
        i32.const 0
        i32.store offset=8
        local.get 5
        if  ;; label = @3
          local.get 2
          local.get 7
          i32.add
          local.tee 2
          local.get 5
          i32.store
          local.get 2
          local.get 6
          i32.store
          local.get 4
          if  ;; label = @4
            local.get 4
            local.get 2
            i32.store offset=4
          else
            local.get 2
            global.set 4
          end
        else
          local.get 4
          if  ;; label = @4
            local.get 4
            local.get 6
            i32.store offset=4
          else
            memory.size
            i32.const 65536
            i32.div_u
            i32.const 8
            i32.sub
            global.set 4
            i32.const 1
            memory.grow
            i32.const -1
            i32.eq
            if  ;; label = @5
              unreachable
            end
            global.get 4
            i32.const 16384
            i32.store
          end
        end
        local.get 2
        return
      end
    end
    unreachable)
  (func $memcpy32 (param $dest i32) (param $src i32) (param $len i32))
  (func $__update_refs (param $addr i32))
  (func $__minor_gc
    (local $p i32) (local $obj i64) (local $dest i32)
    global.get 0
    local.tee 0
    i32.const 1024000
    i32.eq
    if  ;; label = @1
      i32.const 1548276
      global.set 1
      return
    end
    loop $mark_loop
      local.get 0
      i32.load
      call 7
      local.get 0
      i32.const 4
      i32.add
      local.tee 0
      i32.const 1024000
      i32.lt_u
      if  ;; label = @2
        br 1 (;@1;)
      end
    end
    global.get 1
    local.set 0
    loop $cp_loop
      local.get 0
      i64.load
      local.tee 1
      i32.wrap_i64
      i32.const -1073741824
      i32.and
      if  ;; label = @2
        local.get 1
        i64.const 32
        i64.shr_u
        i32.wrap_i64
        local.get 1
        i32.wrap_i64
        call 8
        i32.const 12
        i32.add
        local.set 2
        local.get 0
        local.get 2
        i32.store offset=8
        local.get 2
        local.get 0
        i32.const 12
        i32.add
        local.get 1
        i32.wrap_i64
        i32.const 1073741823
        i32.and
        call 9
      end
      local.get 0
      i32.const 12
      i32.add
      local.get 1
      i32.wrap_i64
      i32.const 1073741823
      i32.and
      i32.add
      local.tee 0
      i32.const 1548276
      i32.lt_u
      if  ;; label = @2
        br 1 (;@1;)
      end
    end
    global.get 0
    local.set 0
    loop $rsu_loop
      local.get 0
      i32.load
      local.tee 2
      call 5
      if  ;; label = @2
        local.get 0
        local.get 2
        i32.const 4
        i32.sub
        i32.load
        i32.store
      end
      local.get 0
      i32.const 4
      i32.add
      local.tee 0
      i32.const 1024000
      i32.lt_u
      if  ;; label = @2
        br 1 (;@1;)
      end
    end
    call 12
    i32.const 1548276
    global.set 1)
  (func $__update_nursery_refs
    (local $p i32) (local $obj i64) (local $size i32) (local $dest i32) (local $bf i32) (local $i i32) (local $bf_cursor i64) (local $local_ind i32) (local $check_ptr i32)
    global.get 1
    local.set 0
    loop $cp_loop
      local.get 0
      i64.load
      local.tee 1
      i32.wrap_i64
      i32.const -1073741824
      i32.and
      if  ;; label = @2
        local.get 1
        i64.const 32
        i64.shr_u
        i32.wrap_i64
        local.tee 4
        if  ;; label = @3
          local.get 1
          i32.wrap_i64
          i32.const 1073741823
          i32.and
          local.set 2
          local.get 0
          i32.load offset=8
          local.set 3
          i32.const 0
          local.set 5
          loop $rbf_loop
            local.get 5
            i32.const 64
            i32.rem_u
            local.tee 7
            i32.eqz
            if  ;; label = @5
              local.get 5
              i32.const 5
              i32.shr_u
              local.get 4
              i32.add
              i64.load
              local.set 6
            end
            i64.const 1152921504606846976
            local.get 7
            i64.extend_i32_u
            i64.shr_u
            local.get 6
            i64.and
            i64.popcnt
            i32.wrap_i64
            if  ;; label = @5
              local.get 3
              local.get 5
              i32.const 2
              i32.shl
              i32.add
              i32.load
              local.tee 8
              call 5
              if  ;; label = @6
                local.get 3
                local.get 5
                i32.const 2
                i32.shl
                i32.add
                local.get 8
                i32.const 4
                i32.sub
                i32.load
                i32.store
              end
            end
            local.get 5
            i32.const 1
            i32.add
            local.tee 5
            local.get 2
            i32.lt_u
            if  ;; label = @5
              br 1 (;@4;)
            end
          end
        end
      end
      local.get 0
      i32.const 12
      i32.add
      local.get 1
      i32.wrap_i64
      i32.const 1073741823
      i32.and
      i32.add
      local.tee 0
      i32.const 1548276
      i32.lt_u
      if  ;; label = @2
        br 1 (;@1;)
      end
    end)
  (func $__heap_free (param i32))
  (func $__major_gc)
  (func $__coalesce
    (local $cur_ptr i32)
    global.get 4
    local.set 0)
  (func $draw
    i32.const 1548292
    i32.load
    i32.const 1548288
    i32.load
    i32.const 4
    i32.const 4
    call 0)
  (export "draw" (func 16))
  (func $update
    (local f32 f32 f32 f32)
    i32.const 1548292
    i32.load
    i32.const 1548300
    i32.load
    i32.add
    i32.const 396
    i32.ge_s
    if  ;; label = @1
      i32.const 1548288
      i32.load
      i32.const 1548296
      i32.load
      i32.add
      i32.const 496
      i32.ge_s
      if  ;; label = @2
        i32.const 0
        call 1
        local.tee 0
        f32.const 0x1.4p+3 (;=10;)
        f32.mul
        i32.trunc_f32_s
        i32.const 1
        i32.add
        i32.sub
        i32.const 1548296
        i32.store
      else
        i32.const 1548288
        i32.load
        i32.const 1548296
        i32.load
        i32.le_s
        if  ;; label = @3
          call 1
          local.tee 1
          f32.const 0x1.4p+3 (;=10;)
          f32.mul
          i32.trunc_f32_s
          i32.const 1
          i32.add
          i32.const 1548296
          i32.store
        end
      end
      i32.const 0
      call 1
      local.tee 2
      f32.const 0x1.4p+3 (;=10;)
      f32.mul
      i32.trunc_f32_s
      i32.const 1
      i32.add
      i32.sub
      i32.const 1548300
      i32.store
    else
      i32.const 1548292
      i32.load
      i32.const 1548300
      i32.load
      i32.le_s
      if  ;; label = @2
        call 1
        local.tee 3
        f32.const 0x1.4p+3 (;=10;)
        f32.mul
        i32.trunc_f32_s
        i32.const 1
        i32.add
        i32.const 1548300
        i32.store
      end
    end
    i32.const 1548288
    i32.load
    i32.const 1548296
    i32.load
    i32.add
    i32.const 1548288
    i32.store
    i32.const 1548292
    i32.load
    i32.const 1548300
    i32.load
    i32.add
    i32.const 1548292
    i32.store)
  (export "update" (func 17))
  (func $loop
    (local f32 f32 f32 f32)
    i32.const 1548292
    i32.load
    i32.const 1548300
    i32.load
    i32.add
    i32.const 396
    i32.ge_s
    if  ;; label = @1
      i32.const 1548288
      i32.load
      i32.const 1548296
      i32.load
      i32.add
      i32.const 496
      i32.ge_s
      if  ;; label = @2
        i32.const 0
        call 1
        local.tee 0
        f32.const 0x1.4p+3 (;=10;)
        f32.mul
        i32.trunc_f32_s
        i32.const 1
        i32.add
        i32.sub
        i32.const 1548296
        i32.store
      else
        i32.const 1548288
        i32.load
        i32.const 1548296
        i32.load
        i32.le_s
        if  ;; label = @3
          call 1
          local.tee 1
          f32.const 0x1.4p+3 (;=10;)
          f32.mul
          i32.trunc_f32_s
          i32.const 1
          i32.add
          i32.const 1548296
          i32.store
        end
      end
      i32.const 0
      call 1
      local.tee 2
      f32.const 0x1.4p+3 (;=10;)
      f32.mul
      i32.trunc_f32_s
      i32.const 1
      i32.add
      i32.sub
      i32.const 1548300
      i32.store
    else
      i32.const 1548292
      i32.load
      i32.const 1548300
      i32.load
      i32.le_s
      if  ;; label = @2
        call 1
        local.tee 3
        f32.const 0x1.4p+3 (;=10;)
        f32.mul
        i32.trunc_f32_s
        i32.const 1
        i32.add
        i32.const 1548300
        i32.store
      end
    end
    i32.const 1548288
    i32.load
    i32.const 1548296
    i32.load
    i32.add
    i32.const 1548288
    i32.store
    i32.const 1548292
    i32.load
    i32.const 1548300
    i32.load
    i32.add
    i32.const 1548292
    i32.store
    i32.const 1548292
    i32.load
    i32.const 1548288
    i32.load
    i32.const 4
    i32.const 4
    call 0
    call 2)
  (export "loop" (func 18))
  (type (;0;) (func (param i32 i32 i32 i32)))
  (type (;1;) (func (result f32)))
  (type (;2;) (func))
  (type (;3;) (func (param i32)))
  (type (;4;) (func (result i32)))
  (type (;5;) (func (param i32) (result i32)))
  (type (;6;) (func (param i32 i32) (result i32)))
  (type (;7;) (func (param i32 i32 i32))))

