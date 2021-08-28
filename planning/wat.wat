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
  (type (;0;) (func (param i32 i32 i32) (result i32)))
  (func (;0;) (type 0) (param $a i32 $b i32 $c i32) (result i32)
    local.get $c
    local.get $b
    local.get $a
    call 1)
  (func (;1;) (type 0) (param i32 i32 i32) (result i32)
    local.get 2
    i32.const 2
    i32.lt_s
    if (result i32)  ;; label = @1
      local.get 0
      local.get 1
      i32.add
    else
      local.get 2
      i32.const 1
      i32.sub
      local.get 1
      local.get 0
      call 1
      local.get 2
      i32.mul
    end)
  (memory (;0;) 1)
  (export "nfac" (func 0))
  (export "memory" (memory 0)))