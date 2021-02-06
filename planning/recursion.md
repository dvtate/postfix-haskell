# Language design flaws - Recursion
In this post I'll go over some of the language desigin decisions that make it particlularly challenging for the compiler to handle recursion. The text will assume no prior knowledge of the language or compiler but will expect knowledge of some advanced CS concepts.

# Quick intro to language
The all  examples can be run in an interactive shell like so
```
$ git clone https://github.com/dvtate/postfix-haskell
$ cd postfix-haskell
$ node tools/shell.js
```
- functional: immutable variables defined via `=` operator
- postfix: operators follow the operands they act on (ie - `1 2 +`)
    + the stack (place where expressions are put) is a compile-time abstraction, and values stored on it often aren't included in the compiled code

## Identifiers
- Escaped identifiers (ie - `$name`) can be used to store any type of value
- Unescaped identifiers will invoke stored value, either running it in place or pushing it's value onto the stack
```ps
# equiv to `let a = 4 * (1 + 2)`
1 2 + 4 * $a =

# Prints `:data - 12`
a :data
```

## Macros
- Macros are equivalent to functions in other languages
- Conceptually similar to executable arrays in postscript
- When invoked, compiler will do as needed to make them run in place
```ps
# Macro that returns the next number
{ 1 + } $incr =

# :data - 6
5 incr :data
5 1 +  :data
```

- macros aren't functions however and aren't limited to a single return value
```ps
# (a,b)->(b,a)
{ $b = $a = b a } $swap =

# (a)->()
{ $_ = } $drop =

# ()->(a,b)
{ 1.0 2.0 } $nums =

nums / :data # 0.5
nums swap / :data # 2
nums drop :data # 1
```

## Functions
- Functions are like macros but overloadable with conditions
- Functions are the only way to do branching in the language
- When invoked the correct branch will be choosen, if no branches work, the compiler will error
- they syntax for functions is `{ condition } { action } $identifier fun`
```ps
# Not operator
{ 1 }    { drop 0 } $! fun	# Always returns false
{ 0 == } { drop 1 } $! fun	# Unless given value is false
```
- Overloadable operators are functions (note the `global` keyword)
```sh
# Make division by zero return infinity
{ :stack 0.0 == } { drop drop Infinity } $/ global fun
1.0 0.0 / :data # Infinity
```
