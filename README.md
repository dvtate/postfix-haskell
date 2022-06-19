# postfix-haskell
A very low-level functional programming language designed to compile to WebAssembly in the browser. The language actually bears very little resemblance to Haskell despite the name.

## How to use
The all examples can be run in an interactive shell like below. Note that this is unfinished and possibly out of date. For better examples check out the recently edited files in the `planning/*` folder. Also note the standard library in `/planning/stdlib/*`.
```
$ git clone https://github.com/dvtate/postfix-haskell
$ cd postfix-haskell
$ npm run build
$ npm install --global
$ phc shell
> "./planning/stdlib/prelude.phs" require use
> 1 2 + :data
:data - 3n
```

## Utilities
The compiler now has a main program that lets you use it through the command line. This can be done by first doing `npm run build` and then either run it locally as `node dist/index.js` or install it to your machine via `npm install --global` so that you can use it via `phc`.
```
[postfix-haskell]$ npm run build
[postfix-haskell]$ sudo npm install --global
[postfix-haskell]$ phc --help
phc <command> [args]

Commands:
  phc shell [options]        run interactive shell                     [default]
  phc file <name> [options]  compile a file to WAT

Options:
      --version  Show version number                                   [boolean]
  -v, --verbose  include verbose output               [boolean] [default: false]
      --help     Show help                                             [boolean]
  -l, --lex      debug lexer tokens                   [boolean] [default: false]
```

### Shell
The shell is probably the best way to learn the language, allowing you to run short bits of code and test expected compiler behavior. In addition to normal code there exist some compiler macros that make debugging easier you can find these in `lib/debug_macros.ts`, for example:

```
[postfix-haskell]$ npm start
> "./planning/stdlib/prelude.phs" include use
> 1 2 + :data
:data - 3n

> 1 2 + :type
:type - {
  syntaxType: 'Data',
  datatype: PrimitiveType { token: undefined, name: 'i32' }
}

> ( I32 ) (: 1 + ) "incr" export :compile
:compile - (module
  (func (;0;) (param i32) (result i32)
    local.get 0
    i32.const 1
    i32.add)
  (export "incr" (func 0))
  (memory (;0;) 1)
  (export "memory" (memory 0))
  (data (;0;) (i32.const 0) "")
  (type (;0;) (func (param i32) (result i32))))
```

### File
For compiling a file to WASM Text format with expectation of errors. Once you know it compiles you can use `tools/optimized.sh` to get an optimized binary
```
phc file <name> [options]

compile a file to WAT

Positionals:
  name  name of the file to open                             [string] [required]

Options:
      --version     Show version number                                [boolean]
  -v, --verbose     include verbose output            [boolean] [default: false]
      --help        Show help                                          [boolean]
  -t, --track-time  track time spent compiling         [boolean] [default: true]
      --fast        skip validation and pretty-print steps
                                                      [boolean] [default: false]
      --folding     use folding/s-expr WAT syntax     [boolean] [default: false]
  -O, --optimize    pass compiled output through binaryen optimizer
                                                                [default: false]
```

### Optimized.sh
Compile given file using `tools/file.ts` and then pass it's output through `wasm-opt` from binaryen. Flags passed at the end are passed to `wasm-opt`, defaulting to `-O`
```
[postfix-haskell]$ ./tools/optimized.sh ./planning/sqrt.phs -Oz
(module ... )
```

### Inline
You can embed the language in JavaScript or TypeScript. See a demo in `planning/inline.ts`.

# Quick intro to language
- functional: immutable variables defined via `=` operator
- postfix: operators follow the operands they act on (ie - `1 2 +`)
  + the stack (place where expressions are put) is a compile-time abstraction, and values stored on it often aren't included in the compiled code
- All the below examples assume you've imported the standard library which contains many basic operators like `+` and `&&`.
  + to import it use `"/[path to this repo]/postfix-haskell/planning/stdlib/prelude.phs" require use`

## Identifiers
- Escaped identifiers (ie - `$name`) can be used to store any type of value
- Unescaped identifiers will invoke stored value, either running it in place or pushing it's value onto the stack
- There are two operators which act on identifiers:
  + `@` : this is the same as unecaping the identifier, it will invoke values
  + `~` : this will unescape the the value but will not invoke it
```php
# equiv to `let a = 4 * (1 + 2)`
1 2 + 4 * $a =

# Prints `:data - 12` at compile time
a :data
```

## Macros
- Macros are equivalent to functions in other languages
- Conceptually similar to executable arrays in postscript
- When invoked, compiler will do as needed to make them run in place
```php
# Macro that returns the next number
# Notice we specified optional type annotations
((I32)(I32): 1 + ) $incr =

# :data - 6
5 incr :data
5 1 +  :data
```

- macros aren't functions however and aren't limited to a single return value
```php
# (a,b)->(b,a)
(: ( $a $b ) = b a ) $swap =

# (a)->()
(: $_ = ) $pop =

# ()->(a,b)
# Notice the optional type annotations
(()(F64 F64): 1.0 2.0 ) $nums =

nums / :data # 0.5
nums swap / :data # 2
nums pop :data # 1
```
Notice that if we want to get the macro stored in a variable we cannot simply unescape it, and must use the `~` operator.
```php
(: $op = 1 2 op ) $apply_operator =
(: + 2 *) $add_and_double =

# This is valid
$add_and_double ~ apply_operator :data # 6

# This is wrong and will not compile
add_and_double apply_operator :data
```

## Branching
- Functions are like macros but overloadable with conditions
- Functions are the only way to do branching in the language
- When invoked, the conditions are checked until reaching one which is truthy
- The truthy branch is taken
- If there are no possible branches the compiler will error
- they syntax for functions is `{ condition } { action } $identifier fun`
```php
# Use bigger of two values

# Here we're checking a runtime condition
(: true ) (: pop ) $max fun
(: < ) (: ( $a $b ) = b ) $max fun

# Here we're checking a compile-time condition
((F32): 1 ) (: "f32.max" asm ) $max fun

# This does basically the same as before but for F64
(: type F64 == ) (: "f64.max" asm ) $max fun

# This takes the F64 branch
1.0 30.1 max :data # 30.1

# This takes the (: < ) branch
# Condition: 30 gets promoted to 30.0 causing it to take the branch
# Action: the other 30 remains on the stack as the result
1.2 30 max :data # 30
```
## Namespaces and Modules
- Namespaces are used to organize identifiers
- Namespaces are made using the `namespace` keyword
- To use an identifier stored in a namespace simply add a `.` between the namespace identifier and the identifier to access.
- The `global` namespace is available at all scopes
- The `use` keyword applies namespaces identifiers to current scope
- Modules are imported using the `require` keyword which gives a namespace
- the `export` keyword
```php
# Import the prelude library which defines `+` and `-`
"./planning/stdlib/prelude.phs" require use

# Create a namespace 'ns'
(:
    5 $five =
    (: + ) $add =
) namespace $ns =

10 $five =

( global.I32 ) (:
    # Get 'five' from the namespace
    ns.five

    # Invoke 'add' from the namespace
    ns.add

    five -
) "demo" export
```

## Syntactic Types
TODO

# Should to add to guide
- Complete list of operators
- List of data and syntactic types
- namespaces elaborate on modules
- recursion