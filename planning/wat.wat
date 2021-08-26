(module
    ;; Shared memory with js
    (import "js" "mem" (memory 1))

    ;; JS function import
    (import "js" "eval" (func $eval_js (param i32 i32)))

    (import "js" "test" (func $test (param i32) (result i32 i32)))

    ;; String containing some JS code
    (data (i32.const 0) "console.log('eval')\00")

    ;; Function "test" that evals js code in string
    (func (export "main")
        (call $eval_js (i32.const 19) (call $def)))

    (func $abc (param i32 f32 i64) (result i32)
        i32.const 0)

    (func $def (result i32)
        i32.const 123
        f32.const 12.33
        i64.const 433
        call $abc
    )
)

(module
  (func (;0;) (param i32) (result i32)
    (local i32)
    call 1
    local.set 1
    local.get 1)
  (export "fac" (func 0))
  (func $rec_0 (param i32) (result i32)
    (local i32)
    local.get 0
    i32.const 2
    i32.lt_s
    if (result i32)  ;; label = @1
      i32.const 1
    else
      local.get 0
      local.get 0
      i32.const 1
      i32.sub
      call 1
      i32.mul
    end
    local.set 1
    local.get 1)
  (memory (;0;) 1)
  (export "memory" (memory 0))
  (data (;0;) (i32.const 0) "")
  (type (;0;) (func (param i32) (result i32))))