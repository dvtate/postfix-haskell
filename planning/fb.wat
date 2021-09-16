(module
  (type (;0;) (func (param i32)))
  (type (;1;) (func (param i32 i32)))
  (import "js" "console.log" (func (;0;) (type 0)))
  (import "js" "logStr" (func (;1;) (type 1)))
  (func (;2;) (type 0) (param i32)
    local.get 0
    i32.const 1
    call 3)
  (func (;3;) (type 1) (param i32 i32)
    local.get 0
    local.get 1
    i32.ge_s
    if  ;; label = @1
      i32.const 1
      local.get 1
      i32.const 5
      i32.rem_s
      local.get 1
      i32.const 3
      i32.rem_s
      select
      if  ;; label = @2
        local.get 1
        i32.const 5
        i32.rem_s
        if  ;; label = @3
          local.get 1
          i32.const 3
          i32.rem_s
          if  ;; label = @4
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
      else
        i32.const 8
        i32.const 0
        call 1
      end
      local.get 0
      local.get 1
      i32.const 1
      i32.add
      call 3
    end)
  (memory (;0;) 1)
  (export "main" (func 2))
  (export "memory" (memory 0))
  (data (;0;) (i32.const 0) "fizzbuzz"))
