# postfix-haskell
A very low-level functional programming language designed to compile to WebAssembly in the browser.

# Quick intro to language
The all examples can be run in an interactive shell like below. Note that this is unfinished and possibly out of date. For better examples check out the recently edited files in the `planning/*` folder.
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

## Branching
- Functions are like macros but overloadable with conditions
- Functions are the only way to do branching in the language
- When invoked the correct branch will be choosen, if no branches work, the compiler will error
- they syntax for functions is `{ condition } { action } $identifier fun`
```ps
# Not operator
{ 1 }    { drop 0 } $! fun	# Always returns false
{ 0 == } { drop 1 } $! fun	# Unless given value is false
```