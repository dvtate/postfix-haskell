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
(func $rec_0 (param f64 f64) (result f64)
                (local f64) (local f64)
        (f64.lt (f64.div (f64.lt (local.get -1) (f64.const 0))
        (if
        (then (local.get -1) (call $import_0     (local.get 1))
        (local.set 2))
        (else (local.get -1) (local.set 2))) (local.get 2)  (local.get 0)) (f64.const 1e-15))
        (if
        (then  (local.get 1) (local.set 3))
        (else
          (local.get 0) (f64.div (f64.add (f64.div  (local.get 0)  (local.get 1))  (local.get 1)) (f64.const 2))  (call $rec_0)
          (local.get 0) (f64.div (f64.add (f64.div  (local.get 0)  (local.get 1))  (local.get 1)) (f64.const 2))  (call $rec_0)(local.set 3)))
         (local.get 3))
            (memory (export "memory") 1)
            (data (i32.const 0) ""))
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
