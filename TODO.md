# TODO
Running list of tasks and stuff

## a. Behavior
1. `volatile` / `opaque`: marks current value as dirty so that the compiler is forced to form AST instead of compile-time operations
2. `fun`: create an operator that has conditions (similar to `std::visit`)
3. `cond`: like a shittier version of `fun` (similar to ys)

## b. Types
1. `class`: wraps a macro, applies unique class to output
2. `make`: Applies classes to value
2. `pack`: treat executable array of values as a single tuple value
    + also works on types to make tuple types
3. `unpack`: opposite of pack, pushes values onto stack
    + also works on types
4. `|`:
    + types: make a union type
    + ints: OR

## c. Lex

## d. Tokens -> AST
- Expression Syntax Type: This is for results for non-constexprs, completed expression trees can be used
- Recursion: need to track macros we've entered so that we can replace recursion with gotos correctly

## e. Globals/Operators
So many omg

## f. AST -> WAT
Still not sure how this should work tbh, but gonna probably need new syntax
- Inline WAT syntax (probably using `(...)`)

## g. Standard library
So many omg. Tbh a lot of other features could be put into standard library instead of compiler because they'd just be wrappers around wasm. But at first likely will be in compiler.
- Stack operators: `pop`, `dup`

## h. Tools
- 'Optimizer': Parses program, generates tree, converts tree back to code (A.1)

## i. Research
- Recursive DataTypes:
- Can we get away with doing everything on the stack?
- Need to actually make some simple wasm programs