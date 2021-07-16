# postfix-haskell
A very low-level functional programming language designed to compile to WebAssembly in the browser.

## How to use
The all examples can be run in an interactive shell like below. Note that this is unfinished and possibly out of date. For better examples check out the recently edited files in the `planning/*` folder.
```
$ git clone https://github.com/dvtate/postfix-haskell
$ cd postfix-haskell
$ tsc
$ node dist/tools/shell.js
1 2 + :data
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
> 1 2 + :data
:data - 3n

> 1 2 + :type
:type - {
  syntaxType: 'Data',
  datatype: PrimitiveType { token: undefined, name: 'i32' }
}

> { I32 } { 1 + } $incr export :compile
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
You can embed the language in JavaScript. See a demo in `planning/inline.ts`.

# Quick intro to language
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
