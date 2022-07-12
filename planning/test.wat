(module
 (type $i32_=>_i32 (func (param i32) (result i32)))
 (type $i32_i32_i32_=>_i32 (func (param i32 i32 i32) (result i32)))
 (memory $0 0)
 (table $0 0 funcref)
 (export "__table" (table $0))
 (export "__memory" (memory $0))
 (export "nfac" (func $0))
 (export "fac" (func $1))
 (export "fib" (func $2))
 (func $0 (param $0 i32) (param $1 i32) (param $2 i32) (result i32)
  local.get $0
  local.get $2
  local.get $1
  call $3
 )
 (func $1 (param $0 i32) (result i32)
  local.get $0
  call $4
 )
 (func $2 (param $0 i32) (result i32)
  local.get $0
  call $5
 )
 (func $3 (param $0 i32) (param $1 i32) (param $2 i32) (result i32)
  local.get $0
  i32.const 2
  i32.lt_s
  if (result i32)
   local.get $2
   local.get $1
   i32.sub
  else
   local.get $0
   i32.const 1
   i32.sub
   local.get $1
   local.get $2
   call $3
   local.get $0
   i32.mul
  end
 )
 (func $4 (param $0 i32) (result i32)
  local.get $0
  i32.const 2
  i32.lt_s
  if (result i32)
   i32.const 1
  else
   local.get $0
   i32.const 1
   i32.sub
   call $4
   local.get $0
   i32.mul
  end
 )
 (func $5 (param $0 i32) (result i32)
  local.get $0
  i32.const 2
  i32.lt_s
  if (result i32)
   i32.const 1
  else
   local.get $0
   i32.const 1
   i32.sub
   call $5
   local.get $0
   i32.const 2
   i32.sub
   call $5
   i32.add
  end
 )
)
