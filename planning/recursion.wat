(module
  (func (;0;) (param i32 i32) (result i32)
    (local i32 i32 i32)
    local.get 0
    i32.const 2
    i32.mul
    local.set 2
    local.get 1
    i32.const 1
    i32.sub
    local.set 3
    loop $rec_0 (result i32)
      block $branch (result i32)
        block  ;; label = @3
          block  ;; label = @4
            local.get 1
            i32.const 1
            i32.sub
            i32.const 0
            i32.eq
            br_if 0 (;@4;)
            i32.const 1
            br_if 1 (;@3;)
          end
          local.get 1
          i32.const 1
          i32.sub
          i32.const 1
          i32.sub
          local.set 2
          local.get 0
          i32.const 2
          i32.mul
          i32.const 2
          i32.mul
          local.set 3
          br 2 (;@1;)
          br 1 (;@2;)
        end
        local.get 0
        i32.const 2
        i32.mul
      end
    end
    local.set 4
    local.get 4)
  (export "lshift" (func 0))
  (type (;0;) (func (param i32 i32) (result i32))))
