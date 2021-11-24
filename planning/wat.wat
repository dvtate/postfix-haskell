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
        (call $eval_js (i32.const 19) (i32.const 0)))

    (func (export "abs") (param f32) (result f32)
        block (result f32)
            block
                local.get 0
                f32.const 0
                f32.lt
                br_if 0
                local.get 0
                br 1
            end
            f32.const 0
            local.get 0
            f32.sub

        end
    )

    (func (export "fac") (param i64) (result i64)
        ;; sum = 1
        (local i64)
        i64.const 1
        local.set 1

        loop (result i64)
            ;; sum *= n
            local.get 0
            local.get 1
            i64.mul
            local.set 1

            ;; n--
            local.get 0
            i64.const 1
            i64.sub
            local.set 0

            ;; do while n >= 2
            local.get 0
            i64.const 2
            i64.ge_s
            br_if 0

            ;; return sum
            local.get 1
        end
    )
)
