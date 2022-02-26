# Closures Planning

## Compiled Result
<!--  -->
Closures are objects which include a function table index (equivalent to a function pointer) for it's implementation along with any captured values. So for example.

```phs
# Macro which returns a closure
((I32 I32)((I32) (I32) Arrow):
    ( $a $b ) =
    ((I32) (I32):
        $in =
        (: true ) (: a ) $branch fun
        (: in ) (: b ) $branch fun
        branch
    )
) $mk_pair =
```

WASM func takes all it's relevant stack arguments but with an added argument which gives a pointer to the second part of the closure object which has relevant captured locals

Ignoring the intricacies of wasm the equivalent in pseudo-C++ would be
```c++
struct closure_t {
    // Action for the closure
    // Here we're pretending that the function acts on the stack
    void (*body) (); // int fn_table_index;

    ... captured local exprs
};
```

## List A - Situations in which Runtime Closures are needed:
- Reading + Writing closure to memory
- Closure result of runtime branch expr
- Result of recursive macro

## Difficulty
- Macro literals need to be converted to closure exprs as soon as we know that they're closures
- We only know that it's a runtime closure after it get's used in one of the above cases

## Compiler Backend
- Augment context class + invoke/trace
    - Augment branches with captured local exprs(`Function`)
        - Note branching with
    - Augment recursion with captured local exprs (`Context.invoke()`)
- Closure Expr (Construct closure object and push it onto stack)
- Macros treated as such until they

### Plan 1 - extend Context class to track macros separately
- To Context class add a separate scope dict list for macros
- Branch and recursive calls copy this list
- When macro is used as in list A it's converted into a `TeeExpr` wrapped closure
- When Branch/Recursive calls converted to IR's the macros

#### Concerns
- Closure defined outside of recursive function but used in both a recursive function and another recursive function contained within it such that the TeeExpr is invalid
    - Maybe fix recursion a 5th time?

### Plan 2 - After lex, determine ids used and defined by closures

### Plan 3 - Refactor Context class track nesting

- really need a

## Maybe in the future - Recursive closures
Might actually be easier to refactor recursion to simply use the same closure object pointer for making recursive calls. Although performance would be worse beacuse fn-Table indirection.