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

(module
  (func (export "main") (param i32)
  (local )
        (local.get 1)(i32.const 1)
        (call $rec_0)(local.set 1) )

(func $rec_0 (param i32 i32)
                (local i32) (local i32) (local i32) (local i32) (local i32) (local i32) (local i32) (local i32) (local i32)
        (if (result )(i32.eq (i32.gt_s  (local.get 2)  (local.get 1))
        (local.tee 2) (i32.const 0))
        (then
        (if (result )(i32.eq (i32.eq (i32.mul (i32.eq (i32.rem_s  (local.get 2) (i32.const 3))
        (local.tee 8) (i32.const 0))
        (local.tee 7) (i32.eq (i32.rem_s  (local.get 2) (i32.const 5))
        (local.tee 10) (i32.const 0))
        (local.tee 9))
        (local.tee 6) (i32.const 0))
        (local.tee 5) (i32.const 0))
        (then (call $import_1  (i32.const 8) (i32.const 0)  ))
        (else (if (result )(i32.eq (i32.rem_s  (local.get 2) (i32.const 5))
        (local.tee 4) (i32.const 0))
        (then (call $import_1  (i32.const 4) (i32.const 4)  ))
        (else (if (result )(i32.eq (i32.rem_s  (local.get 2) (i32.const 3))
        (local.tee 3) (i32.const 0))
        (then (call $import_1  (i32.const 4) (i32.const 0)  ))
        (else (call $import_0   (local.get 2)  )))))))
           (local.get 1) (i32.add  (local.get 2) (i32.const 1))  (call $rec_0))
        (else  ))
         )

(import "js" "console.log" (func $import_0 (param  i32) (result )))

(import "js" "logStr" (func $import_1 (param  i32 i32) (result )))
            (memory (export "memory") 1)
            (data (i32.const 0) "\66\69\7A\7A\62\75\7A\7A"))