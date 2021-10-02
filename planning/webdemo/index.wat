(module
  (import "js" "contextFillRect" (func $import_0 (param i32 i32 i32 i32)))
  (import "js" "Math.random" (func $import_1 (result f32)))
  (import "js" "nextFrame" (func $import_2))
  (func $draw
    i32.const 4
    i32.load
    i32.const 0
    i32.load
    i32.const 4
    i32.const 4
    call 0)
  (export "draw" (func 3))
  (func $update
    (local f32 f32 f32 f32)
    i32.const 4
    i32.load
    i32.const 12
    i32.load
    i32.add
    i32.const 396
    i32.ge_s
    if  ;; label = @1
      i32.const 0
      i32.load
      i32.const 8
      i32.load
      i32.add
      i32.const 496
      i32.ge_s
      if  ;; label = @2
        i32.const 8
        i32.const 0
        call 1
        local.tee 0
        f32.const 0x1.4p+3 (;=10;)
        f32.mul
        i32.trunc_f32_s
        i32.const 1
        i32.add
        i32.sub
        i32.store
      else
        i32.const 0
        i32.load
        i32.const 8
        i32.load
        i32.le_s
        if  ;; label = @3
          i32.const 8
          call 1
          local.tee 1
          f32.const 0x1.4p+3 (;=10;)
          f32.mul
          i32.trunc_f32_s
          i32.const 1
          i32.add
          i32.store
        else
          i32.const 8
          i32.const 8
          i32.load
          i32.store
        end
      end
      i32.const 12
      i32.const 0
      call 1
      local.tee 2
      f32.const 0x1.4p+3 (;=10;)
      f32.mul
      i32.trunc_f32_s
      i32.const 1
      i32.add
      i32.sub
      i32.store
    else
      i32.const 4
      i32.load
      i32.const 12
      i32.load
      i32.le_s
      if  ;; label = @2
        i32.const 12
        call 1
        local.tee 3
        f32.const 0x1.4p+3 (;=10;)
        f32.mul
        i32.trunc_f32_s
        i32.const 1
        i32.add
        i32.store
      else
        i32.const 12
        i32.const 12
        i32.load
        i32.store
      end
    end
    i32.const 0
    i32.const 0
    i32.load
    i32.const 8
    i32.load
    i32.add
    i32.store
    i32.const 4
    i32.const 4
    i32.load
    i32.const 12
    i32.load
    i32.add
    i32.store)
  (export "update" (func 4))
  (func $loop
    (local f32 f32 f32 f32)
    i32.const 4
    i32.load
    i32.const 12
    i32.load
    i32.add
    i32.const 396
    i32.ge_s
    if  ;; label = @1
      i32.const 0
      i32.load
      i32.const 8
      i32.load
      i32.add
      i32.const 496
      i32.ge_s
      if  ;; label = @2
        i32.const 8
        i32.const 0
        call 1
        local.tee 0
        f32.const 0x1.4p+3 (;=10;)
        f32.mul
        i32.trunc_f32_s
        i32.const 1
        i32.add
        i32.sub
        i32.store
      else
        i32.const 0
        i32.load
        i32.const 8
        i32.load
        i32.le_s
        if  ;; label = @3
          i32.const 8
          call 1
          local.tee 1
          f32.const 0x1.4p+3 (;=10;)
          f32.mul
          i32.trunc_f32_s
          i32.const 1
          i32.add
          i32.store
        else
          i32.const 8
          i32.const 8
          i32.load
          i32.store
        end
      end
      i32.const 12
      i32.const 0
      call 1
      local.tee 2
      f32.const 0x1.4p+3 (;=10;)
      f32.mul
      i32.trunc_f32_s
      i32.const 1
      i32.add
      i32.sub
      i32.store
    else
      i32.const 4
      i32.load
      i32.const 12
      i32.load
      i32.le_s
      if  ;; label = @2
        i32.const 12
        call 1
        local.tee 3
        f32.const 0x1.4p+3 (;=10;)
        f32.mul
        i32.trunc_f32_s
        i32.const 1
        i32.add
        i32.store
      else
        i32.const 12
        i32.const 12
        i32.load
        i32.store
      end
    end
    i32.const 0
    i32.const 0
    i32.load
    i32.const 8
    i32.load
    i32.add
    i32.store
    i32.const 4
    i32.const 4
    i32.load
    i32.const 12
    i32.load
    i32.add
    i32.store
    i32.const 4
    i32.load
    i32.const 0
    i32.load
    i32.const 4
    i32.const 4
    call 0
    call 2)
  (export "loop" (func 5))
  (memory (;0;) 1)
  (export "memory" (memory 0))
  (data (;0;) (i32.const 0) "2\00\00\00\14\00\00\00\01\00\00\00\01\00\00\00")
  (type (;0;) (func (param i32 i32 i32 i32)))
  (type (;1;) (func (result f32)))
  (type (;2;) (func)))

