(module
  (func (;0;) (param i32) (result i32)
    (local i32 i32 i32)
    local.get 0
    local.set 1
    loop $rec_0 (result i32)
      local.get 1
      i32.const 2
      i32.lt_s
      if (result i32)  ;; label = @2
        i32.const 1
      else
        local.get 1
        local.get 1
        i32.const 1
        i32.sub
        local.set 1
        br 1 (;@1;)
        i32.mul
      end
      local.set 3
      local.get 3
    end
    local.set 2
    local.get 2)
  (export "fac" (func 0))
  (memory (;0;) 1)
  (export "memory" (memory 0))
  (data (;0;) (i32.const 0) "")
  (type (;0;) (func (param i32) (result i32))))
