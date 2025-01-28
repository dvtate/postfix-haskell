import * as fs from 'fs';
import * as path from 'path';

import * as types from './datatypes.js';
import * as value from './value.js';
import * as expr from './expr/index.js';
import * as error from './error.js';
import Context from './context.js';
import WasmNumber from './numbers.js';
import Fun, { wideCompat } from './function.js';
import scan, { LexerToken, MacroToken, TokenType } from './scan.js';
import { ActionRet, CompilerMacro, LiteralMacro, Macro } from './macro.js';
import { invokeAsm } from './asm.js';
import { EnumNs, EnumValue } from './enum.js';
import { EnumMatchExpr } from './expr/index.js';
import { genGcBitfield } from './expr/gc_util.js';
import stdlibs from '../std/index.js';
import PackedV128 from './v128.js';

// function fromDataValue(params: value.Value[]): DataExpr[] {
//     return params as DataExpr[];
// }

/*
These are globally defined operators some may eventually be moved to standard library
*/

// TODO break this up into files
// TODO go through and replace everwhere we return string[] and replace it with error.*

// NOTE ALWAYS verify inputs
// NOTE THINK: could this be moved to a standard library?

// Util to convert to boolean value
const toBool = (b : boolean, token: LexerToken) =>
    new value.NumberValue(token, new WasmNumber().fromString(b ? '1' : '0'));

// Type for following type
type MacroOperatorsSpec = {
    [operator : string] : {
        action: (ctx: Context, token: LexerToken)
            => Context | Array<string> | undefined | SyntaxError | void;
        type?: types.ArrowType;
        description: string;
        signature: string;
        example?: string | string[];
        deprecated?: boolean;
    };
};

// Operators that the user shouldn't overload
const operators : MacroOperatorsSpec = {
    // Bind identifier(s) to expression(s)
    '=' : {
        description: 'assign an expression to an identifier',
        signature: '<expression> <escaped identifier> =',
        example: '90.0 $angle =',
        action: (ctx, token) => {
            // Get symbols to bind
            if (ctx.stack.length < 2)
                return ['expected an expression and a binding identifier'];
            const sym = ctx.pop();

            // Get a list of symbols to assign
            let syms : value.IdValue[];
            if (sym instanceof Macro) {
                // List of identifiers to pull from stack in reverse order
                const tr = ctx.traceIO(sym, token);
                if (tr instanceof error.SyntaxError)
                    return tr;

                // Take IdValue[]
                if (tr.gives.some(sym => !(sym instanceof value.IdValue)))
                    return ['macro produced invalid results'];
                if (ctx.stack.length < tr.gives.length)
                    return ['not enough values to bind'];
                syms = (tr.gives as value.IdValue[]).reverse();
            } else if (sym instanceof value.IdValue) {
                // Single identifier to pull from stack
                syms = [sym];
            } else if (sym instanceof value.TupleValue) {
                // Tuple of identifiers
                if (sym.value.some(sym => !(sym instanceof value.IdValue)))
                    return ['expected a tuple of identifiers'];
                if (ctx.stack.length < sym.value.length)
                    return ['not enough values to bind'];
                syms = (sym.value as value.IdValue[]).reverse();
            } else {
                // Syntax error
                ctx.pop();
                return ['missing symbol(s) to bind'];
            }

            // Bind idenfiers
            for (let i = 0; i < syms.length; i++) {
                const ret = ctx.setId(syms[i].value, ctx.pop(), token);
                if (ret)
                    return ret;
            }
        },
    },

    // Union type operator
    // TODO override for bitwise or
    // TODO convert to function
    '|' : {
        description: 'create a union type',
        signature: '<type 1> <type 2> |',
        example: 'I32 I64 | $Int =',
        action: (ctx, token) => {
            // Get input
            if (ctx.stack.length < 2)
                return ['expected 2 operands'];
            const b = ctx.pop();
            const a = ctx.pop();
            if (a.type != b.type)
                return ['invalid syntax'];
            if (a.type !== value.ValueType.Type)
                return ['left value should be a type'];

            // Extract types from values
            const aType = a.value as types.Type;
            const bType = b.value as types.Type;

            // Create type union
            const ret = new types.UnionType(token, []);
            ret.types = (aType instanceof types.UnionType ? aType.types : [aType])
                    .concat(bType instanceof types.UnionType ? bType.types : [bType]);
            ctx.push(new value.Value(token, value.ValueType.Type, ret));
        },
    },

    // Make a type wrapper that assigns class tag to output datatype
    'class' : {
        description: 'create a class type',
        signature: '<macro | type> class',
        example: '(: $T = ( T T T ) ) class $Vec3 =',
        action: (ctx, token) => {
            // Pull a macro or type
            if (ctx.stack.length === 0)
                return ['expected a macro or type'];
            const arg = ctx.pop();

            // For types it's faster
            if (arg.type == value.ValueType.Type) {
                ctx.push(
                    new value.Value(token, value.ValueType.Type,
                        new types.ClassType(token, arg.value)));
                return;
            }

            // Validate input
            if (!(arg instanceof Macro))
                return ['expected a type or macro to make a class of'];
            const v: Macro = arg;

            // Generate new class
            const id = new types.ClassType(token, null, undefined, v.recursive).id;

            // Wrap macro with one that appends class type to return value
            const wrapper = (ctx: Context, tok: LexerToken) => {
                // TODO i think scoping is fucked :/
                // Invoke v
                const oldStack = ctx.stack.slice();
                const ev = v.action(ctx, tok);
                if (typeof ev === 'object' && !(ev instanceof Context))
                    return ev;
                // console.log('ev', ev);

                // Assert that macro returns a single type
                // TODO use ctx.traceIO() instead
                const retlen = ctx.stack.length - ctx.cmpStack(oldStack);
                if (retlen > 1)
                    return ['type macro should only return one value']; // TODO use error.SyntaxError here
                let t = ctx.pop();
                if (t.type !== value.ValueType.Type)
                    return ['expected a type to append class to'];

                // TODO add classes field to types.EnumBaseType
                // if (t instanceof EnumNs) {
                //     const type = t.datatype as types.EnumBaseType;
                //     return;
                // }

                t = t.value;
                // if (v.recursive)
                //     t = new types.RefType(tok, t);

                // Use class wrapper
                ctx.push(
                    new value.Value(tok, value.ValueType.Type,
                        new types.ClassType(tok, t as any, id, v.recursive)));
            };

            // Push
            ctx.push(new CompilerMacro(token, wrapper));
        },
    },

    // Unpack a tuple
    'unpack' : {
        description: 'put the elements of a tuple onto the stack',
        signature: '<tuple> unpack',
        example: '( 1 2 3 ) unpack + +',
        action: (ctx, token) => {
            // Pull
            if (ctx.stack.length === 0)
                return ['expected a tuple'];
            const v = ctx.pop();

            // Branch
            if (v.type === value.ValueType.Type) {
                if (!(v.value instanceof types.TupleType))
                    return ['expected a tuple to unpack'];

                // Push types onto the stack
                v.value.types.forEach(t =>
                    ctx.push(new value.Value(token, value.ValueType.Type, t)));

            } else if (v.type === value.ValueType.Data) {
                if (!(v instanceof value.TupleValue))
                    return ['expected a tuple to unpack'];

                // Push values onto the stack
                v.value.forEach(val => ctx.push(val));
            } else if (v.type === value.ValueType.Expr) {
                // Verify it's a tuple expr
                if (v.value instanceof value.TupleValue) {
                    v.value.value.forEach(val => ctx.push(val));

                // TODO probably more ways to have tuple exprs...
                //  for example: types marked with 'rec' should be stored in LM
                // TODO value should contain tuple
                } else {
                    let e: expr.UnpackExpr;
                    try {
                        e = new expr.UnpackExpr(token, v, ctx);
                    } catch (e) {
                        if (e instanceof error.SyntaxError) {
                            return e;
                        } else {
                            throw e;
                        }
                    }
                    ctx.push(...e.results);
                }
            } else {
                return ['expected a tuple to unpack'];
            }
        },
    },

    // Assign classes to value, instantate class
    // TODO Exprs, recursive types, etc.
    // TODO make this a function?
    'make' : {
        description: 'instantiate a class',
        signature: '<expression> <class type> make',
        example: '( 0 0 0 ) I32 Vec3 make $origin =',
        action: (ctx, token) => {
            // Get type
            if (ctx.stack.length < 2)
                return ['not enough values']
            const t = ctx.pop();
            if (t.type !== value.ValueType.Type)
                return ['expected a class to apply'];
            if (!(t.value instanceof types.ClassType || t.value instanceof types.EnumClassType))
                return ['invalid type, expected a class'];

            // Get data
            const v = ctx.pop();
            if (![value.ValueType.Data, value.ValueType.Expr].includes(v.type))
                return ['expected data to apply class to'];

            // Check compatibility
            const compatible = t.value instanceof types.ClassType
                ? t.value.getBaseType().check(v.datatype)
                : t.value.type.check(v.datatype);
            if (!compatible) {
                // console.log('make: incompatible', t.value, t.value.getBaseType(), v.datatype);
                ctx.warn(token, 'class applied to incompatible data');
            }

            // Apply class to data
            if (t.value instanceof types.EnumClassType) {
                ctx.push(new EnumValue(v.token, v, t.value));
            // } if ((t instanceof types.ClassType && t.isRecursive) 
            //     || (t instanceof types.DataType && t.recursive)) 
            // {
            //     if (v.type == value.ValueType.Expr)
            //         new expr.
            } else {
                v.datatype = t.value;
                ctx.push(v);
            }
        },
    },

    // Get the datatype of a value
    'type' : {
        description: 'get the type of an expression',
        signature: '<expr> type',
        example: '123 type',
        action: (ctx: Context, token: LexerToken) => {
            if (ctx.stack.length === 0)
                return ['expected an expression to get type from'];
            const v = ctx.pop();
            if (!v.datatype)
                return ['value has undefined datatype'];
            ctx.push(v.datatype
                ? new value.Value(token, value.ValueType.Type, v.datatype)
                : new value.NumberValue(token, new WasmNumber(WasmNumber.Type.I32, 0n)));
        },
    },

    // Vector literal
    'v128' : {
        description: 'make a V128 literal given a string literal',
        signature: '<string literal> v128',
        example: '"i32x4 1 2 3 4" v128',
        action: (ctx: Context, token: LexerToken) => {
            if (ctx.stack.length === 0)
                return ['expected a vector literal string'];
            const v = ctx.pop();
            if (v.type !== value.ValueType.Str)
                return ['expected a vector literal string'];
            try {
            ctx.push(new value.VectorValue(token, new PackedV128(v.value as string)));
            } catch (e: any) {
                return new error.SyntaxError('Invalid vector literal: ' + e?.message, v.token || token, ctx)
            }
        },
    },

    // Function operator
    'fun' : {
        description: 'create a \'function\' for branching. Using the identifier invokes the function',
        signature: '<macro condition> <macro action> <escaped identifier name> fun',
        example: '(: 1 ) (: $n = n ) $abs fun\n(: 0 < ) (: -1 * ) $abs fun',
        action: (ctx: Context, token: LexerToken) => {
            // Get operands
            if (ctx.stack.length < 3)
                return ['expected a condtion action and symbol'];
            const sym = ctx.pop();
            if (!(sym instanceof value.IdValue))
                return ['expected a symbol'];
            const action = ctx.pop();
            if (!(action instanceof Macro))
                return ['expected a macro action'];
            const condition = ctx.pop();
            if (!(condition instanceof Macro))
                return ['expected a macro condition'];

            // Bind Symbol
            const v = ctx.getId(sym.value);
            if (!v)
                // New function
                ctx.setId(
                    sym.value,
                    new value.Value(token, value.ValueType.Fxn,
                        new Fun(token, condition, action, sym.value[sym.value.length - 1])),
                    token,
                );
            else if (v.type === value.ValueType.Fxn)
                // Pre-existing function to overload
                v.value.overload(token, condition, action);
            else
                // Type-error
                return ['symbol currently stores un-fun value'];
        },
    },

    'export' : {
        description: 'define a function to export from current module',
        signature: '<tuple input types> <macro body> <string identifier> export',
        example: '(I32 I32) (: + ) "add" export',
        action: (ctx: Context, token: LexerToken) => {
            // Get operands
            if (ctx.stack.length < 3)
                return ['not enough values'];
            const id = ctx.pop();
            let sym : string;
            if (id instanceof value.IdValue)
                sym = id.token.token.slice(1);
            else if (id instanceof value.StrValue)
                sym = id.value;
            else
                return ['expected a symbol'];
            const act = ctx.pop();
            if (!(act instanceof Macro))
                return ['expected macro'];
            const args = ctx.pop();
            if (args.type !== value.ValueType.Type || !(args.value instanceof types.TupleType))
                return ['expected tuple of input types'];

            // Get input types
            const err = args.value.assertIsDataType();
            if (err) {
                err.tokens.push(token);
                return err;
            }
            const inTypes = args.value.types as types.DataType[];


            // Put param exprs onto stack
            // TODO this only works with primitive types and unit
            const out = new expr.FunExportExpr(token, sym, inTypes);
            ctx.push(...out.params);

            // Invoke macro to determine structure of fxn
            // Get output values
            // TODO make sure stack is empty so that it only pulls from params
            const ev1 = ctx.traceIO(act, token);
            if (!(ev1 instanceof Context.TraceResults))
                return ev1;
            const ovs = ev1.gives;
            if (ovs.some(v => ![value.ValueType.Data, value.ValueType.Expr].includes(v.type)))
                return ['wasm exports can only return data values'];
            out.outputs = ovs as expr.DataExpr[]; // TODO more safety checks

            ctx.module.addFunction(out);

            ctx.popn(out.params.length);
        },
    },

    'Arrow' : {
        description: 'create an arrow type',
        signature: '<tuple input types> <tuple output types> Arrow',
        example: '(I32 I32) (I32) Arrow',
        action: (ctx: Context, token: LexerToken) => {
            // Get operands
            if (ctx.stack.length < 2)
                return ['not enough values'];
            const outputsTuple = ctx.pop();
            const inputsTuple = ctx.pop();

            // Get input types
            let inputs: types.Type[];
            if (inputsTuple instanceof value.TupleValue && inputsTuple.value.length === 0) {
                ctx.warn(token, '() is context sensitive, you should use `Unit` or use `() type`');
                inputs = [];
            } else if (inputsTuple.type === value.ValueType.Type) {
                const bt = inputsTuple.value instanceof types.ClassType
                    ? inputsTuple.value.getBaseType()
                    : inputsTuple.value;
                if (!(bt instanceof types.TupleType))
                    return new error.SyntaxError('Expected a tuple type for inputs', token, ctx);
                inputs = bt.types;
            } else {
                return new error.SyntaxError('Expected a tuple type for inputs', token, ctx);
            }

            // Get output types
            let outputs: types.Type[];
            if (outputsTuple instanceof value.TupleValue && outputsTuple.value.length === 0) {
                ctx.warn(token, '() is context sensitive, you should use `Unit` or use `() type`');
                outputs = [];
            } else if (outputsTuple.type === value.ValueType.Type) {
                const bt = outputsTuple.value instanceof types.ClassType
                ? outputsTuple.value.getBaseType()
                : outputsTuple.value;
                if (!(bt instanceof types.TupleType))
                    return new error.SyntaxError('Expected a tuple type for outputs', token, ctx);
                outputs = bt.types;
            } else {
                return new error.SyntaxError('Expected a tuple type for outputs', token, ctx);
            }

            // Push Type onto the stack
            const type = new types.ArrowType(token, inputs, outputs);
            ctx.push(new value.Value(token, value.ValueType.Type, type));
        },
    },

    'import' : {
        description: 'Import function from the module host',
        signature: '<arrow type signature> <tuple of scope strings> import',
        example: '(Unit I32) (Unit) Arrow ( "js" "consoleLog" ) import $log_i32 =',
        action: (ctx: Context, token: LexerToken) => {
            // Get operands
            if (ctx.stack.length < 2)
                return ['not enough values'];
            const scopes = ctx.pop();
            const type = ctx.pop();
            if (!(scopes instanceof value.TupleValue))
                return ['expected a tuple of scopes'];
            if (type.type !== value.ValueType.Type)
                return ['expected a type for the input'];
            if (!(type.value instanceof types.ArrowType))
                return ['expected an arrow type for the import'];

            // Get scopes
            if (scopes.value.some(s => !(s instanceof value.StrValue)))
                return ['expected an executable array of string scopes'];
            const scopeStrs = scopes.value.map(s => s.value) as string[];

            // Add relevant import
            const importName = ctx.module.addImport(scopeStrs, type.value);
            if (importName instanceof error.SyntaxError) {
                importName.tokens.push(token);
                return importName;
            }

            // Macro action which calls the import
            const callImport = (ctx: Context, token: LexerToken): ActionRet => {
                // Verify matching input types
                const inputs: value.Value[] = [];
                if (ctx.stack.length < type.value.inputTypes.length)
                    return ['not enough values'];
                for (let i = type.value.inputTypes.length - 1; i >= 0; i--) {
                    const v = ctx.pop();
                    if (!v.datatype || !type.value.inputTypes[i].check(v.datatype)) {
                        console.log('incompatible value passed to imported function call',
                            v, type.value.inputTypes[i]);
                        return ['incompatible value passed to imported function call'];
                    }
                    inputs.push(v);
                }
                inputs.reverse();

                // Make call expr
                // TODO this is sketchy
                if (type.value.outputTypes && type.value.outputTypes.length === 1) {
                    ctx.push(new expr.TeeExpr(token, new expr.InstrExpr(
                        token,
                        type.value.outputTypes[0],
                        `call ${importName} `,
                        expr.fromDataValue(inputs, ctx))));
                    return;
                }

                // Handle unlikely case of import with multi-returns... sketchy
                const instrExpr = new expr.MultiInstrExpr(
                    token,
                    `call ${importName}`,
                    expr.fromDataValue(inputs, ctx),
                    type.value.outputTypes,
                );
                ctx.push(...instrExpr.results);
            };

            // Wrap import call in a macro
            ctx.push(new CompilerMacro(token, callImport, importName, type.value));
        },
    },

    'namespace' : {
        description: 'create a named scope for identifiers',
        signature: '<macro> namespace',
        example: '(: (: + ) $add = ) namespace $math =',
        action: (ctx: Context, token: LexerToken) => {
            // Pull macro
            if (ctx.stack.length === 0)
                return ['missing value'];
            const arg = ctx.pop();
            if (!(arg instanceof LiteralMacro))
                return ['expected a macro literal'];

            // Create ns
            const ns = arg.getNamespace(ctx, token);
            if (ns instanceof value.NamespaceValue)
                ctx.push(ns);
            else
                return ns;
        },
    },

    'use' : {
        description: 'promote all members of namespace to current scope',
        signature: '<namespace> use',
        example: 'math use',
        action: (ctx: Context, token: LexerToken) => {
            // Get namespace
            if (ctx.stack.length === 0)
                return ['missing namespace'];
            const ns = ctx.pop();
            if (!(ns instanceof value.NamespaceValue))
                return ['expected a namespace'];

            // Promote members
            ns.value.promote(ctx, token);
        },
    },

    // TODO this is not intuitive
    'use_some' : {
        description: 'promote some members of namespace to current scope',
        signature: '<namespace> <string regular expression include symbols> <string regular expression exclude symbols> use_some',
        example: 'math "add" "" use_some',
        action: (ctx: Context, token: LexerToken) => {
            // Get params
            if (ctx.stack.length < 3)
                return ['not enough values'];
            const exclude = ctx.pop();
            if (!(exclude instanceof value.StrValue))
                return ['expected a string containing regex for symbols to exclude'];
            const include = ctx.pop();
            if (!(include instanceof value.StrValue))
                return ['expected a string containing regex for symbols to include'];
            const ns = ctx.pop();
            if (!(ns instanceof value.NamespaceValue))
                return ['expected a namespace'];

            // Promote members
            ns.value.promote(ctx, token, include.value, exclude.value);
        }
    },

    // Include another file as a module
    'require' : {
        description: 'load another source file into a namespace',
        signature: '<string path to file> require <namespace>',
        example: ['"./math.phs" require $math =', '"lang" require use'],
        action: (ctx: Context, token: LexerToken) => {
            // Get argument
            if (ctx.stack.length === 0)
                return ['no value'];
            const arg = ctx.pop();
            if (!(arg instanceof value.StrValue))
                return ['expected a string path'];

            // Get absolute path
            let realpath: string;
            const curDir = token.file ? path.parse(token.file).dir : '.';
            let moduleSource: string;

            if (arg.value in stdlibs) {
                // Standard library
                const mod = stdlibs[arg.value as keyof typeof stdlibs];
                realpath = mod.path;
                moduleSource = mod.src;
            } else {
                // Get full-path
                try {
                    realpath = fs.realpathSync(path.normalize(arg.value[0] == '/'
                        ? arg.value
                        : path.join(curDir, arg.value)));
                } catch (e: any) {
                    return new error.SyntaxError(`require: ${e && e.message}`, [arg.token, token], ctx);
                }
                moduleSource = fs.readFileSync(realpath).toString();
            }

            // Check if already included
            // If so give user the cached namespace
            if (ctx.includedFiles[realpath]) {
                ctx.push(new value.NamespaceValue(
                    token,
                    ctx.includedFiles[realpath]));
                return;
            }

            // Load file
            const tokens = scan(moduleSource, realpath);

            // Put file into a macro
            const block = new MacroToken(token.token, token.position, token.file || curDir, tokens, [], false);

            // Convert file into namespace and push it
            const ns = new LiteralMacro(ctx, block).getNamespace(ctx, token);
            if (!(ns instanceof value.NamespaceValue))
                return ns;
            ctx.push(ns);
            ctx.includedFiles[realpath] = ns.value;
        },
    },

    // Is the value known at compile-time
    'is_const' : {
        description: 'Check if value is known at compile-time',
        signature: '<expression> is_const <1 or 0>',
        example: '1 2 + is_const',
        action: (ctx: Context, token: LexerToken) => {
            // Only expressions are
            if (ctx.stack.length === 0)
                return ['missing value'];
            const arg = ctx.pop();
            ctx.push(toBool(!(arg instanceof expr.Expr), token))
        },
    },

    'defer' : {
        description: 'Defer results of calculations invloving this value until runtime',
        signature: '<expression> defer <expression>',
        example: '1 2 + defer',
        action: (ctx: Context) => {
            // Get value from stack
            if (ctx.stack.length === 0)
                return ['missing value']
            const arg = ctx.pop();
            if (!(arg instanceof value.NumberValue))
                return ['Currently only numbers can be deferred'];

            // Wrap the number value in an expression
            ctx.push(new expr.NumberExpr(arg.token, arg));
        }
    },

    'asm' : {        
        description: 'Inline assembly',
        signature: 'Signature varies based on operator used',
        example: '1 2 "i32.add" asm',
        action: (ctx: Context, token: LexerToken) => {
            // Get number of arguments and symbol
            if (ctx.stack.length === 0)
                return ['missing value']
            const cmd = ctx.pop();
            if (!(cmd instanceof value.StrValue))
                return ['expected a String literal instruction'];

            // Use wasm definitions
            return invokeAsm(ctx, token, cmd.value);
        },
    },

    // Unsafe, custom inline assembly
    '__asm' : {
        description: 'Unsafe/custom inline assembly',
        signature: '<arrow type signature> <string mnemonic> __asm <return types from signature>',
        example: '( Unit I32 I32 ) ( Unit ) "i32.store" __asm',
        action: (ctx: Context, token: LexerToken) => {
            // Get args
            if (ctx.stack.length < 2)
                return ['expected type signature and mnemonic for instruction'];
            const mnemonic = ctx.pop();
            const sig = ctx.pop();
            if (!(mnemonic instanceof value.StrValue))
                return ['expected mnemonic to be a string literal'];
            if (sig.type !== value.ValueType.Type || !(sig.value instanceof types.ArrowType))
                return ['expected type signature to be an arrow type'];

            // Get inputs
            const { inputTypes, outputTypes } = sig.value as types.ArrowType;
            if (ctx.stack.length < inputTypes.length)
                return ['not enough inputs given'];
            const inputs = ctx.popn(inputTypes.length).reverse();
            if (!inputs.reduce((r, v, i) => r && inputTypes[i].check(v.datatype), true)) {
                console.error(inputs.map(i => i.datatype), 'vs', inputTypes);
                return ['invalid input types received'];
            }
            if (inputTypes.some(t => !(t instanceof types.DataType)))
                return ['unexpected compile-only type'];
            if (outputTypes.some(t => !(t instanceof types.DataType)))
                return ['unexpected compile-only type'];

            // Create expression
            if (outputTypes.length > 1) {
                const e = new expr.MultiInstrExpr(token, mnemonic.value, expr.fromDataValue(inputs, ctx), outputTypes as types.DataType[]);
                ctx.push(...e.results);
            } else {
                ctx.push(new expr.InstrExpr(token, outputTypes[0] as types.DataType, mnemonic.value, expr.fromDataValue(inputs, ctx)));
            }
        },
    },

    // Moving typechecking behavior from == to here
    '__typecheck' : {
        description: 'Check if two types are compatible (used internally to define ==)',
        signature: '<type 1> <type 2> __typecheck',
        example: '55 type I32 __typecheck',
        action: (ctx, token) => {
            if (ctx.stack.length < 2)
                return ['missing values'];
            const [a, b] = ctx.popn(2).reverse();
            if (b.type !== value.ValueType.Type)
                return new error.SyntaxError('expected a type', [b.token, token], ctx);
            if (a.type !== value.ValueType.Type)
                return new error.SyntaxError('expected a type', [a.token, token], ctx);
            ctx.push(toBool(b.value.check(a.value), token));
        }
    },

    'static_region' : {
        description: 'Allocate a region of mutable static memory for program use',
        signature: '<I32 number of bytes needed> static_region <I32 address>',
        example: '32 static_region $name_addr =',
        action: (ctx, token) => {
            if (ctx.stack.length === 0)
                return ['missing number of bytes to mark'];
            const len = ctx.pop();
            if (!(len.value instanceof WasmNumber))
                return ['length must be a constexpr number'];

            // Fill region with zeros and return address
            const data = new Uint8Array(Number(len.value.value));
            const ret = new WasmNumber(
                WasmNumber.Type.I32,
                ctx.module.addStaticData(data, false),
            );
            ctx.push(new value.NumberValue(token, ret));
        },
    },

    'static_init_byte' : {
        description: 'Initialize a byte of memory at an address allocated by static_region to a value',
        signature: '<I32 value> <I32 address> static_init_byte',
        example: '0 name_addr static_init_byte',
        action: (ctx) => {
            // Get args
            if (ctx.stack.length < 2)
                return ['missing value'];
            const [v, ptr] = ctx.popn(2).reverse();
            if (!(v.value instanceof WasmNumber))
                return ['value must be constexpr int'];
            if (!(ptr.value instanceof WasmNumber))
                return ['value must be constexpr byte'];

            // Set static
            ctx.module.setStaticData(Number(ptr.value.value), Number(v.value.value));
        },
    },

    // Mark a type as recursive so that it's stored in linear memory
    // TODO apply same logic to mark macros as recursive
    'rec' : {
        description: 'Mark a type as recursive',
        signature: '<type> rec',
        example: [],
        deprecated: true,
        action: ctx => {
            if (ctx.stack.length == 0)
                return ['missing argument'];
            const v = ctx.pop();
            if (v.type !== value.ValueType.Type)
                return ['expected a type'];
            if (!(v.value instanceof types.DataType))
                return ['type argument must be representable on hardware'];
            v.value.recursive = true;
            ctx.push(v);
        },
    },

    '__gc_ref_bf': {
        description: 'Generate a reference bitfield for a type. This is potentially relevant for garbage collection and unsafe memory operations',
        signature: '<type> __gc_ref_bf <string ref bf>',
        example: 'I32 Vec3 __gc_ref_bf',
        deprecated: true,
        action: (ctx, token) => {
            if (ctx.stack.length == 0)
                return ['missing argument'];
            const v = ctx.pop();
            if (v.type !== value.ValueType.Type)
                return ['expected a type'];
            if (!(v.value instanceof types.DataType))
                return ['type argument must be representable on hardware'];
            const bf = genGcBitfield(v.value);
            const ret = new value.StrValue(token, bf);
            ctx.push(ret);
        },
    },

    // Tagged union/sum type
    'enum' : {
        description: 'Ereate an enum type. Similar to namespace',
        signature: '<macro> enum',
        example: '(: I64 class $Int =  F64 class $Float = ) enum $Num =',
        action: (ctx, token) => {
            // Get arg
            if (ctx.stack.length === 0)
                return ['expected a macro namespace'];
            const arg = ctx.pop();
            if (!(arg instanceof LiteralMacro))
                return ['expected a macro literal'];

            // Create ns
            const enumBt = new types.EnumBaseType(token, {}, arg.recursive);
            const ns = arg.getNamespace(
                ctx,
                token,
                new value.Value(token, value.ValueType.Type, enumBt),
            );
            if (!(ns instanceof value.NamespaceValue))
                return ns;

            // Create enum type value
            const ret = EnumNs.fromNamespace(ns.value, token, ctx, enumBt);
            if (ret instanceof EnumNs)
                ctx.push(ret);
            else
                return ret;
        },
    },

    // Temporary pattern match operator for enums
    'match' : {
        description: 'Pattern match on an enum value',
        signature: '<enum value> <tuple branches> match',
        example: '( Num.Int (: -1.0 * ) Num.float (: -1.0 * ) ) match',
        action: (ctx, token) => {
            // Get arg
            if (ctx.stack.length < 2)
                return ['operator `match` expected branches and an enum to match on. `<enum> <branches tuple> match`'];
            const arg = ctx.pop();
            if (!(arg instanceof value.TupleValue))
                return ['expected a tuple of macro branches'];
            if (arg.value.length === 0)
                return ['empty tuple passed to `match`'];

            // Get the shit from the tuple they gave us
            let enumType: types.EnumBaseType;
            let elseCase: Macro = null;
            const indiciesFound: Macro[] = []; // used like a sparse array
            for (let i = 0; i < arg.value.length;) {
                const k = arg.value[i++];
                const m = arg.value[i++];
                if (k.type !== value.ValueType.Type)
                    return new error.SyntaxError('Expected an enum type here', [k.token, token], ctx);
                if (!(m instanceof Macro))
                    return new error.SyntaxError('Expected a macro here', [m.token, token], ctx);
                if (k.value instanceof types.ClassType)
                    k.value = k.value.getBaseType();
                if (k.value instanceof types.EnumBaseType) {
                    return new error.SyntaxError('Invalid Enum base type in match expression', [k.token, token], ctx);

                    // TODO allow use of base type as else case
                    // tbh I don't think this is a good feature to have, too much work for minor syntactic sugar
                    /*
                    if (elseCase)
                        return new error.SyntaxError('Too many else cases', [k.token, token], ctx);

                    enumType = k.value;
                    elseCase = m.value;
                    */
                } else if (k.value instanceof types.EnumClassType) {
                    if (!enumType)
                        enumType = k.value.parent;
                    if (enumType === k.value.parent) // TODO use .check()
                        indiciesFound[k.value.index] = m;
                    else
                        return new error.SyntaxError('For now only one enum type allowed per match expresson', [k.token, token], ctx);
                } else
                    return new error.SyntaxError('Expected an enum type here', [k.token, token], ctx);
            }

            // impossible to branch from here lol
            if (!enumType)
                return ['No type to match on'];

            // Get values from stack
            const enumv = ctx.stack[ctx.stack.length - 1];
            const edt = (enumv.datatype instanceof types.ClassType)
                ? enumv.datatype.getBaseType()
                : enumv.datatype;
            if (!edt.check(enumType)) { // shouldn't this .check be the other way around?
                // console.log('edt:', edt.toString());
                // if (edt.toString() == 'F64')
                //     console.log(enumv);
                // console.log('enumType:', enumType.toString());
                // console.log('enumType.c(edt):', enumType.check(edt));
                return new error.SyntaxError(
                    'Attempt to match on type incompatible with that of given value',
                    [edt.token, enumv.token, enumType.token, token],
                    ctx,
                );
            }

            // Constexpr
            const subtypes = enumType.sortedSubtypes();
            if (edt instanceof types.EnumClassType && edt.parent.check(enumType) && !(enumv instanceof expr.Expr)) {
                if (indiciesFound[edt.index]) {
                    // Branch found, remove enum wrapper
                    if (enumv instanceof expr.EnumConstructor && enumv.knownValue instanceof value.Value)
                        ctx.stack[ctx.stack.length - 1] = enumv.knownValue;
                    else if (enumv instanceof EnumValue)
                        ctx.stack[ctx.stack.length - 1] = enumv.value;
                    else {
                        const v = expr.EnumGetExpr.create(token, enumv, edt, ctx);
                        if (v instanceof error.SyntaxError)
                            return v;
                        ctx.stack[ctx.stack.length - 1] = v;
                    }
                    return ctx.invoke(indiciesFound[edt.index], token, false);
                }
                if (elseCase)
                    return ctx.invoke(elseCase, token, false);
                return [`Missing case for ${edt.name} in match`];
            }

            // To prevent duplicate expressions we can copy input exprs to locals
            const oldStack = ctx.stack.slice();
            ctx.stack = ctx.stack.map(v =>
                v instanceof expr.DataExpr && v.expensive
                    ? new expr.BranchInputExpr(v.token, v)
                    : v);

            // Trace the branches
            const outputs: value.Value[][] = [];
            const subtypeBranchBindings: number[] = new Array(subtypes.length);
            let outputDt: types.ArrowType;
            let elseOutputsInd = -1;
            for (let i = 0; i < subtypes.length; i++) {
                if (!indiciesFound[i]) {
                    // Misssing case

                    // Missing case + no else => error
                    if (!elseCase)
                        return [`Missing \`match\` case for subtype ${subtypes[i].name}, For else case, use enum base type`];

                    if (elseOutputsInd < 0) {
                        // Else case hasn't been traced yet

                        // Trace
                        const trs = ctx.traceIO(elseCase, token);
                        if (trs === null) {
                            console.log('trs null');
                            continue;
                        }
                        if (trs instanceof error.SyntaxError)
                            return trs;

                        // Validate
                        const t = trs.toArrowType(elseCase.token);
                        if (outputDt) {
                            // Note that outputDt may be altered
                            const v = { datatype: outputDt };
                            if (!wideCompat(v, t))
                                return new error.SyntaxError(
                                    `Incompatible macro types in tuple passed to match: ${
                                        outputDt.toString()}\nand\n${t.toString()}`,
                                    [elseCase.token, outputDt.token, token],
                                    ctx,
                                );
                        } else {
                            outputDt = t;
                            outputDt.inputTypes = outputDt.inputTypes.map(() => new types.AnyType(token));
                        }

                        // Add binding
                        elseOutputsInd = outputs.push(trs.gives) - 1;
                        subtypeBranchBindings[i] = elseOutputsInd;
                    } else {
                        // Use else case
                        subtypeBranchBindings[i] = elseOutputsInd;
                    }
                } else {
                    // Trace
                    const tmp = ctx.stack[ctx.stack.length - 1];
                    const v = expr.EnumGetExpr.create(token, tmp, subtypes[i], ctx);
                    if (v instanceof error.SyntaxError)
                        return v;
                    ctx.stack[ctx.stack.length - 1] = v;
                    const trs = ctx.traceIO(indiciesFound[i], token);
                    if (trs === null)
                        continue;
                    if (trs instanceof error.SyntaxError)
                        return trs;
                    ctx.stack[ctx.stack.length - 1] = tmp;

                    // Validate
                    const t = trs.toArrowType(indiciesFound[i].token);
                    if (outputDt) {
                        // Note that outputDt may be altered
                        const v = { datatype: outputDt };
                        if (!wideCompat(v, t))
                            return new error.SyntaxError(
                                `Incompatible macro types in tuple passed to match: ${
                                    outputDt.toString()}\nand\n${t.toString()}`,
                                [t.token, outputDt.token, token],
                                ctx,
                            );
                    } else {
                        outputDt = t;
                        outputDt.inputTypes = outputDt.inputTypes.map(() => new types.AnyType(token));
                    }

                    // Add binding
                    subtypeBranchBindings[i] = outputs.push(trs.gives) - 1;
                }
            }

            // Construct expression
            const matchExpr = new EnumMatchExpr(
                token,
                ctx.stack.slice(-outputDt.inputTypes.length),
                outputs,
                subtypeBranchBindings,
                outputDt.outputTypes as types.DataType[], // TODO warning
            )
            if (!(matchExpr instanceof EnumMatchExpr))
                return matchExpr;
            ctx.stack = oldStack;
            ctx.popn(outputDt.inputTypes.length);
            ctx.push(...matchExpr.results);
        },
    },

    // TODO tuple.at, tuple.length
};

// Global functions that the user can overload
const funs = {
    // Invoke operator: dreference/unescape a symbol
    '@' : new value.Value(null, value.ValueType.Fxn, new Fun(
        null,
        new CompilerMacro(null, (ctx, token) => {
            if (!ctx.pop())
                return ['missing argument'];
            ctx.push(toBool(true, token));
        }, '@'),
        new CompilerMacro(null, (ctx, token) => {
            let v = ctx.pop();
            if (v instanceof value.IdValue)
                v = v.deref(ctx);
            return ctx.invoke(v, token);
        }, '@'),
        '@',
    )),

    // Dereference operator: dereference a symbol (equivalent to @ except doesn't invoke macros + functions)
    '~' : new value.Value(null, value.ValueType.Fxn, new Fun(
        null,
        new CompilerMacro(null, (ctx, token) => {
            if (!ctx.pop())
                return ['missing argument'];
            ctx.push(toBool(true, token));
        }),
        new CompilerMacro(null, (ctx, token) => {
            const sym = ctx.pop();
            if (!(sym instanceof value.IdValue))
                return ['expected an escaped identifier to extract value from'];
            const v = sym.deref(ctx);
            if (!v)
                return ['undefined'];
            v.token = token;
            ctx.push(v);
        }),
        '~',
    )),

    // Default ==
    // TODO Refactor/simplify?
    '==' : new value.Value(null, value.ValueType.Fxn, new Fun(
        null,
        new CompilerMacro(null, (ctx, token) => {
            // Pull args
            if (ctx.stack.length < 2)
                return ['expected two expressions to compare'];
            const b = ctx.pop();
            const a = ctx.pop();

            // Check syntax types
            const isData = [a, b].every(v =>
                v instanceof value.DataValue || v instanceof expr.DataExpr);
            const isType = [a, b].every(v => v.type === value.ValueType.Type)
            if (a.type !== b.type && !isData && !isType) {
                console.log('==: syntax err', {a, b});
                return ['invalid syntax'];
            }

            // Check datatypes
            if (isData && !b.datatype.check(a.datatype)) {
                console.log('==: incompatible', {a, b});
                return ['incompatible types'];
            }

            // Continue
            ctx.push(toBool(true, token));
        }),
        new CompilerMacro(null, (ctx, token) => {
            // Pull args
            if (ctx.stack.length < 2)
                return ['expected two expressions to compare'];
            const b = ctx.pop();
            const a = ctx.pop();
            // const isData = ![a, b].some(v => ![value.ValueType.Expr, value.ValueType.Data].includes(v.type));
            // if (!isData && a.type !== b.type)
            //     return [`disparate types ${a.type} ${b.type} ==`];

            // Handle
            switch (a.type) {
                // Typechecking
                case value.ValueType.Type:
                    ctx.push(toBool(b.value.check(a.value), token));
                    break;

                // Partial Evaluation comparison
                case value.ValueType.Data: {
                    // Cannot compare incompatible datatypes
                    if (!b.datatype.check(a.datatype))
                        return ['incompatible types'];

                    // Non-primitives
                    const aType = a.datatype instanceof types.ClassType ? a.datatype.getBaseType() : a.datatype;
                    const bType = b.datatype instanceof types.ClassType ? b.datatype.getBaseType() : b.datatype;
                    if (!(aType instanceof types.PrimitiveType))
                        return ['builtin == only accepts primitives (overload $global.== global fun)'];
                    if (!(bType instanceof types.PrimitiveType))
                        return ['builtin == only accepts primitives (overload $global.== global fun)'];

                    // Compile-time check
                    if (b.type === value.ValueType.Data) {
                        ctx.push(toBool(a.value.equals(b.value), token));
                        return;
                    }

                    // Runtime check
                    if (b.type === value.ValueType.Expr) {
                        if (a.value.value === BigInt(0)) {
                            ctx.push(new expr.InstrExpr(
                                token,
                                types.PrimitiveType.Types.I32,
                                `${bType.name}.eqz`,
                                expr.fromDataValue([b], ctx)
                            ));
                        } else {
                            ctx.push(new expr.InstrExpr(
                                token,
                                types.PrimitiveType.Types.I32,
                                `${aType.name}.eq`,
                                expr.fromDataValue([a, b], ctx)
                            ));
                        }
                        return;
                    }
                    throw "wtf?";
                }

                // TODO expr
                // Runtime comparison
                case value.ValueType.Expr: {
                    // Cannot compare incompatible datatypes
                    if (!b.datatype.check(a.datatype))
                        return ['incompatible types'];

                    // Non-primitives
                    const aType = a.datatype instanceof types.ClassType ? a.datatype.getBaseType() : a.datatype;
                    const bType = b.datatype instanceof types.ClassType ? b.datatype.getBaseType() : b.datatype;
                    if (!(aType instanceof types.PrimitiveType))
                        return ['builtin == only accepts primitives (overload $global.== global fun)'];
                    if (!(bType instanceof types.PrimitiveType))
                        return ['builtin == only accepts primitives (overload $global.== global fun)'];

                    if (b.type === value.ValueType.Data && b.value.value === BigInt(0)) {
                        ctx.push(new expr.InstrExpr(
                            token,
                            types.PrimitiveType.Types.I32,
                            `${aType.name}.eqz`,
                            expr.fromDataValue([a], ctx)
                        ));
                    } else {
                        ctx.push(new expr.InstrExpr(
                            token,
                            types.PrimitiveType.Types.I32,
                            `${aType.name}.eq`,
                            expr.fromDataValue([a, b], ctx),
                        ));
                    }
                    return;
                }

                // String literal comparison
                case value.ValueType.Str:
                    // // Sanity check
                    // if (!(a instanceof value.StrValue) || !(b instanceof value.StrValue))
                    //     return ['wtf'];
                    ctx.push(toBool(a.value === b.value, token));
                    return;

                // Invalid syntax type passed
                default:
                    // console.log(a.typename(), b.typename());
                    return ['syntax error'];
            }
        }),
        '==',
    )),

    // This should probably be removed
    // 'as' : new value.Value(null, value.ValueType.Fxn, new Fun(
    //     null,
    //     new CompilerMacro(null, (ctx, token) => {
    //         // macro + any datatype
    //         const type = ctx.pop();
    //         const v = ctx.pop();
    //         if (type.type !== value.ValueType.Type)
    //             return ctx.push(toBool(false, token));
    //         else if (!(v instanceof Macro))
    //             return ['as operator currently can only apply types to macros'];
    //         else
    //             return ctx.push(toBool(true, token));
    //     }),
    //     new CompilerMacro(null, ctx => {
    //         // Get args
    //         const type = ctx.pop();
    //         const value = ctx.pop();

    //         // Assume it's arrow type, if not, convert it to one
    //         // Do typecheck:
    //             // Copy stack and put input types onto it
    //             // Invoke macro
    //             // Verify results are correct
    //             // TODO probably should have something dedicated to this in Context/Macro

    //         // TODO this is placeholder
    //         value.datatype = type.value;
    //         ctx.push(value);
    //     }),
    //     'as',
    // )),
};

// Export map of macros
const exportsObj = Object.entries(operators).reduce((ret, [k, v]) =>
    ({
        ...ret,
        [k] : new CompilerMacro(null, v.action, k, v.type || undefined),
    }), {});

// Add some other values as well
export default {
    ...exportsObj,
    ...funs,
};