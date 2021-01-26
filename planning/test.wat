(module
(func $succ (param $0 i32) (result i32)
	(i32.add (local.get 0) (i32.const 1)))
(func $test (param $0 f64) (result f64)
        (f64.add (f64.add (f64.mul (f64.const 4) (local.get 0)) (f64.const 8)) (f64.mul (f64.const 4) (local.get 0)))))
