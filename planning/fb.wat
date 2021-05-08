(module
  (type (;0;) (func (param i32)))
  (type (;1;) (func (param i32 i32)))
  (import "js" "console.log" (func (;0;) (type 0)))
  (import "js" "logStr" (func (;1;) (type 1)))
  (func (;2;) (type 0) (param i32)
    (local i32)
    i32.const 1
    local.set 1
    loop  ;; label = @1
      local.get 0
      local.get 1
      i32.ge_s
      if  ;; label = @2
        local.get 1
        i32.const 3
        i32.rem_s
        i32.eqz
        local.get 1
        i32.const 5
        i32.rem_s
        i32.eqz
        i32.mul
        if  ;; label = @3
          i32.const 8
          i32.const 0
          call 1
        else
          local.get 1
          i32.const 5
          i32.rem_s
          if  ;; label = @4
            local.get 1
            i32.const 3
            i32.rem_s
            if  ;; label = @5
              local.get 1
              call 0
            else
              i32.const 4
              i32.const 0
              call 1
            end
          else
            i32.const 4
            i32.const 4
            call 1
          end
        end
        local.get 1
        i32.const 1
        i32.add
        local.set 1
        br 1 (;@1;)
      end
    end)
  (memory (;0;) 1)
  (export "main" (func 2))
  (export "memory" (memory 0))
  (data (;0;) (i32.const 0) "fizzbuzz"))
