# TODO
Running list of tasks and stuff

## a. Behavior
- `volatile` / `opaque`: marks current value as dirty so that the compiler is forced to form AST instead of compile-time operations
- [x] `fun`: create an operator that has conditions (similar to `std::visit`)
- [x] `global`: use global version of escaped identifer
- `import`: load file as a module

## b. Types
- [x] `class`: wraps a macro, applies unique class to output
- [x] `make`: Applies classes to value
- [x] `pack`: treat executable array of values as a single tuple value
    + also works on types to make tuple types
- [x] `unpack`: opposite of pack, pushes values onto stack
    + also works on types
- [x] `|`:
    + types: make a union type
    + ints: OR
- [x] `==`:
    + todo: overload for ints

### Track aliasing
When user uses an identifier to produce a type we should add some property to the type
that lets us track the name they gave to it so that debugging is easier.
This is espescially important for classes.

## c. Lex
- Module syntax `:`
- Optimize scanner

## d. Tokens -> AST
- Expression Syntax Type: This is for results for non-constexprs, completed expression trees can be used
- Recursion: need to track macros we've entered so that we can replace recursion with gotos correctly

## e. Globals/Operators
So many omg

## f. AST -> WAT
Still not sure how this should work tbh, but gonna probably need new syntax
- Inline WAT syntax (probably using `(...)`)
- `export`: type signature and identifier. Generates WASM to operate on generic values

## g. Standard library
So many omg. Tbh a lot of other features could be put into standard library instead of compiler because they'd just be wrappers around wasm. But at first likely will be in compiler.
- Stack operators: `pop`, `dup`

## h. Tools
- 'Optimizer': Parses program, generates tree, converts tree back to code (A.1)

## i. Research
- Recursive DataTypes:
- Can we get away with doing everything on the stack?
- Need to actually make some simple wasm programs