;; Notice that the Binaryen optimizer used `select` instruction to remove branching!
;; If we used -O3 it wouldn't because select doesn't short-circuit
(module
  (type (;0;) (func (param i32) (result i32)))
  (func (;0;) (type 0) (param i32) (result i32)
    i32.const -3
    local.get 0
    i32.const -1
    local.get 0
    i32.const 3
    i32.rem_s
    select
    i32.const -2
    local.get 0
    i32.const 5
    i32.rem_s
    select
    i32.const 0
    local.get 0
    i32.const 3
    i32.rem_s
    i32.eqz
    local.get 0
    i32.const 5
    i32.rem_s
    select
    select)
  (export "fb" (func 0)))
