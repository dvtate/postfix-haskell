(module
    ;; Shared memory with js
    (import "js" "mem" (memory 1))

    ;; JS function import
    (import "js" "eval" (func $eval_js (param i32 i32)))

    (import "js" "console.log" (func $log (param i32)))

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

    (func (export "test")
        ;; a = 1073741824
        (local i32)
        i32.const 1073741824
        local.set 0

        ;; while true:
        (loop
            ;; a++
            local.get 0
            i32.const 1
            i32.add
            local.set 0
            br 0
        )
    )
)
