# GC'd Reference Stack Locals
## Problem
The reference stack is used by the garbage collector as a list of roots which can be modifed by the gc function. The runtime provides push and pop operations but there is no simple way to store variables like we do with normal WASM values.

## Not Solutions
References on the stack exist in mutable linear memory, thus we could simply push some extra pointers onto the stack as long as we pop them before the end of the function, but this could cause problems for operators which directly call pop, and thus isn't an option

Instead we must add a second level of indirection, and store addresses of pointers on the stack in wasm variables. But this isn't easy to do without popping them from the stack. But this presents it's own challenges. We could try addinga  `Context.pullOffset` variable but there is no algorithm to accurately maintain it in all cases (see commented out section).

<!-- As we want to emulate behavior of actually pushing and popping values from the stack the compiler will need a `Context.pullOffset` field which lets us do `(i32.add (global.get $__ref_sp) (i32.const {{Context.pullOffset++}}))` to get the address of the pointer to the object that the user beleives is stored in the identifier. However this also means that when the identifier get's used we have to decriment `Context.pullOffset` -->

Thus we have to

## Solution overview
The runtime has 3 stacks as follows
- Stack 0: WASM Stack with aforementioned limitations
- Stack 1: Stack for operations involving gc'd objects
- Stack 2: Stack for variables referencing gc'd objects

We need stack 1 because we can't have GC pointers on the wasm stack because we need to be able to go back and trace all the roots and update addresses. This also applies to wasm variables thus the need for stack 2. WASM vars can however point to pointers on stack 2.

Thus when we need to make a local for a gc'd reference we move that reference from stack 1 to stack 2 and store a pointer to it's location in stack 2 into a local. This way if the GC moves it out of the nursery, the program won't break.

Alternatively we could directly store the reference in a wasm variable after putting it into stack 2, but we'd have to make sure that it's been moved out of the nursery.