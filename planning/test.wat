(module
  (func (;0;) (param i32) (result i32)
    local.get 0
    i32.const 5
    i32.rem_s
    i32.const 0
    i32.eq
    i32.const 0
    i32.eq
    i32.const 0
    i32.eq
    if (result i32)  ;; label = @1
      i32.const 1
    else
      i32.const 0
    end
    if (result i32)  ;; label = @1
      local.get 0
      i32.const 3
      i32.rem_s
      i32.const 0
      i32.eq
    else
      i32.const 0
    end
    if (result i32)  ;; label = @1
      i32.const -3
    else
      local.get 0
      i32.const 5
      i32.rem_s
      i32.const 0
      i32.eq
      if (result i32)  ;; label = @2
        i32.const -2
      else
        local.get 0
        i32.const 3
        i32.rem_s
        i32.const 0
        i32.eq
        if (result i32)  ;; label = @3
          i32.const -1
        else
          local.get 0
        end
      end
    end)
  (export "fb" (func 0))
  (type (;0;) (func (param i32) (result i32))))

