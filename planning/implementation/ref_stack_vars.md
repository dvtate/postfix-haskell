# GC'd Reference Stack Locals
## Problem
The reference stack is used by the garbage collector as a list of roots which can be modifed by the gc function. The runtime provides push and pop operations but there is no simple way to store variables like we do with normal WASM values.

The garbage collector cannot see values stored in WASM locals. Thus we need to have a separate stack to store roots

## Not Solutions
References on the stack exist in mutable linear memory, thus we could simply push some extra pointers onto the stack as long as we pop them before the end of the function, but this could cause problems for operators which directly call pop, and thus isn't an option

Instead we must add a second level of indirection, and store addresses of pointers on the stack in wasm variables. But this isn't easy to do without popping them from the stack. But this presents it's own challenges. We could try adding a `Context.pullOffset` variable but there is no algorithm to accurately maintain it in all cases (see commented out section).

<!-- As we want to emulate behavior of actually pushing and popping values from the stack the compiler will need a `Context.pullOffset` field which lets us do `(i32.add (global.get $__ref_sp) (i32.const {{Context.pullOffset++}}))` to get the address of the pointer to the object that the user beleives is stored in the identifier. However this also means that when the identifier get's used we have to decriment `Context.pullOffset` -->

## Solution overview
The runtime has 3 stacks as follows
- Stack 0: WASM Stack with aforementioned limitations
- Stack 1: Stack for operations involving gc'd objects
- Stack 2: Stack for variables referencing gc'd objects

We need stack 1 because we can't have GC pointers on the wasm stack because we need to be able to go back and trace all the roots and update addresses. This also applies to wasm variables thus the need for stack 2. WASM vars can however point to pointers on stack 2.

Thus when we need to make a local for a gc'd reference we move that reference from stack 1 to stack 2 and store a pointer to it's location in stack 2 into a local. This way if the GC moves it out of the nursery, the program won't break.

Alternatively we could directly store the reference in a wasm variable after putting it into stack 2, but we'd have to make sure that it's been moved out of the nursery.

## Revision \[unimplemented\]
This way we can combine Stack 1 and Stack 2 from previous solution. Stack 0 is still unaddressable however
```
0x0 ------------------------------------> 0xfff...
<-[working stack][locals][params][....]
  ^              ^       ^      ^
  |              |       |      |
  |              |       |      L Max accessible to the function
  |              |       L stack pointer when call was made
  |              L RVLocals stack pointer
  L stack pointer
```


### Implementation Requirements
- This would require changing how ParamExpr's get compiled when the function is compiled.
- Instead of being stack values like current, they would be locals 
- No modifications to call code
- Need to copy the return value back to overwrite the params (ugly)
  - `memmove( $sp, $frame_end - ( $rvlocals_start - $sp ),  $rvlocals_start - $sp )` ?
  - needs to copy i32's in reverse to prevent overwriting

```c
// locals_size = number of RVLocals + number of reference params
#define fn_body_start(locals_size) {
  if ( locals_size != 0 ) {
    g_sp -= locals_size * sizeof(i32); // includes params
  }
}

// return_size = number of pointers on the stack at return time
//               these need to be copied so that they overwrite the params
#define fn_body_end(locals_size, return_size) {
  if ( return_size != 0 ) {
    memcpy_i32_rev(g_sp + locals_size, g_sp, return_size);
    g_sp -= return_size * sizeof(i32);
  }

  if ( locals_size != 0 ) {
    g_sp += locals_size * sizeof(i32); // includes params
  }
}
```

```
;; we have to iterate backwards because
;; if the return value is bigger than RVLocals + params 
;; then it could overwrite itself

;; @param dest where to store
;; @param src where to read
;; @param n number of i32 pointers to read
(func $memcpy_i32_rev (param $dest i32) (param $src i32) (param $n i32)
  ;; should not call if $n == 0

  ;; n = (n - 1) * 4
  local.get $n
  i32.const 1
  i32.sub
  i32.shl 2
  local.set $n

  ;; do
  (loop $for_each_i32
    ;; *(dest + n) = *(src + n)
    (i32.store
      (i32.add (local.get $dest) (local.get $n))
      (i32.load (i32.add (local.get $src) (local.get $n))))
    
    ;; while (--n != 0)
    local.get $n
    i32.const 4 ;; sizeof(i32)
    i32.sub
    local.tee $n
    br_if $for_each_i32
  )
)
```

#### Challenges
- Generating offsets for params since they will be `fn.stackOffset - paramIndex` and stackOffset changes throughout compilation.
- Need to move the return values back to replace the RVLocals and params on the stack. (muh performance)
  - yikes
- Comment from 2022: Slightly hard part is generating offsets for params since they will be `fn.stackOffset - paramIndex` and stackOffset changes throughout compilation
