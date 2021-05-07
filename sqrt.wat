(module
  (func (;0;) (param f64 f64)
    (local f64 f64 f64 f64 f64 f64 f64 f64 f64 f64)
    local.get 0
    local.set 1
    f64.const 0x1p+0 (;=1;)
    local.set 2
    loop $rec_0 (result f64)
      local.get 2
      local.get 2
      f64.mul
      local.tee 6
      local.get 1
      f64.sub
      local.tee 5
      f64.const 0x0p+0 (;=0;)
      f64.lt
      if (result f64)  ;; label = @2
        local.get 5
        f64.const -0x1p+0 (;=-1;)
        f64.mul
      else
        local.get 5
      end
      local.set 7
      local.get 7
      local.get 1
      f64.div
      local.tee 4
      f64.const 0x1.203af9ee75616p-50 (;=1e-15;)
      f64.lt
      if (result f64)  ;; label = @2
        local.get 2
      else
        local.get 1
        local.set 1
        local.get 1
        local.get 2
        f64.div
        local.tee 9
        local.get 2
        f64.add
        local.tee 8
        f64.const 0x1p+1 (;=2;)
        f64.div
        local.set 2
        br 1 (;@1;)
      end
      local.set 10
      local.get 10
    end
    local.set 3
    local.get 3)
  (export "sqrt" (func 0))
  (memory (;0;) 1)
  (export "memory" (memory 0))
  (data (;0;) (i32.const 0) "")
  (type (;0;) (func (param f64 f64))))

