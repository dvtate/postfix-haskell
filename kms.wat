
(module
(import "js" "console.log" (func $import_0 (param  i32) (result )))
(import "js" "logStr" (func $import_1 (param  i32 i32) (result )))

(func (export "main") (param i32)
  (local.get 0)(i32.const 1)
  (call $rec_0))

(func $rec_0 (param i32 i32)
  (local i32) (local i32) (local i32) (local i32) (local i32) (local i32) (local i32) (local i32) (local i32)
  (if (result )
    (i32.eq
      (i32.gt_s (local.get 1) (local.get 0)) (local.tee 2)
      (i32.const 0))
    (then
      (if (result )
        (if (result i32)
          (local.tee 5 (i32.eq
            (i32.rem_s  (local.get 1) (i32.const 3)) (local.tee 6)
            (i32.const 0)))
          (then
            (if (result i32)
              (local.tee 7 (i32.eq
                (i32.rem_s  (local.get 1) (i32.const 5)) (local.tee 8)
                (i32.const 0))
              )
              (then
                (i32.const 1))
              (else
                (i32.const 0)))
            (local.set 9) (local.get 9))
          (else
            (i32.const 0)))

            (local.set 10)
            (local.get 10)

        (then
          (call $import_1 (i32.const 8) (i32.const 0)  ))
        (else
          (if (result )
            (i32.eq
              (i32.rem_s  (local.get 1) (i32.const 5)) (local.tee 4)
              (i32.const 0))
            (then
              (call $import_1  (i32.const 4) (i32.const 4)  ))
            (else
              (if (result )
                (i32.eq
                  (i32.rem_s  (local.get 1) (i32.const 3)) (local.tee 3)
                  (i32.const 0))
                (then
                  (call $import_1  (i32.const 4) (i32.const 0)  ))
                (else
                  (call $import_0  (local.get 1))))))))
      (local.get 0)
      (i32.add  (local.get 1) (i32.const 1))
      (call $rec_0))
    (else  )))
(memory (export "memory") 1)
(data (i32.const 0) "\66\69\7A\7A\62\75\7A\7A"))