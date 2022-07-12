# Compiler Overview
This guide should hopefully help someone understand the weird way this project is structured.

## Main Idea
This compiler is a low-pass compiler with the three main phases being as such
1. `scan() => LexerToken[]` : Lex + Parse-CFG
2. `parse() => Context` : Parse + Semantics + Optimizations
3. `Context.out*() =>` WASM \[text]: Convert IR to webassembly
4. Optional external tool: use `wasm-opt` to catch some things compiler did not

## `scan()` / `lib/scan.ts`
This function handles the context free grammars of the language and parses it into a very primitive AST. Although it has a lexer and a parser (in order to collapse containers), internally it's described as the lexer, and the tokens it produces are termed `LexerToken`s

## `parse()` / `lib/parse.ts`
Low-pass parser + semantic analyzer + optimizer. It handles a lot of different stuff as it is encountered. Constant expressions are evaluated at compile-time and non-constant expressions are converted into a graph-like intermediate representation for the next phase. The bulk of the code in this project is assocated with this phase and thus `lib/parse.ts` ony represents the entry point for it.

### Some files associated with this phase and what they do
- `lib/globals.ts`: Implementation for built-in operators and stuff
- `lib/function.ts`: Describe behavior for functions (created with `fun`)
- `lib/macro.ts`: Describe behavior for macros (enclosed with `(:` and `)`)
- `lib/value.ts`: Describe things which are stored on the stack
- `lib/debug_macros.ts`: Implementation for some built-in debugging tools
- `lib/namespace.ts`: Describe behavior for namespaces (created with `namespace` and `require`)
- `lib/numbers.ts`: Emulate WASM number values
- `lib/asm.ts`: Emulate WASM instructions
- `lib/context.ts`: context object for this phase of the compilation
- `lib/parse.ts`: describes basic processing behavior for lexer tokens

## Compilation
This phase involves the fairly straightforward conversion from our IR into WebAssembly text format source code.

### Some files associated with this phase and what they do
- `expr/*`: Implementation for our IR and how it's compiled
    - `expr/branch.ts`: Implementation for IR nodes related to branching
    - `expr/recursion.ts`: Implementation for IR nodes related to recursion
    - `expr/expr.ts`: Assorted IR node implementations
    - `expr/index.ts`: Default export, exports all IR node definitions
- `module.ts`: Handles everything that goes into the `...` in `(module ... )`
