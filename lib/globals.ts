import * as value from './value';
import * as types from './datatypes';
import * as expr from './expr';
import * as error from './error';
import Context from './context';
import WasmNumber from './numbers';
import Fun from './function';
import scan, { BlockToken, LexerToken } from './scan';
import { CompilerMacro, LiteralMacro, NamespaceMacro } from './macro';
import * as fs from 'fs';
import * as path from 'path';
import { invokeAsm } from './asm';
import { fromDataValue } from './expr';

// function fromDataValue(params: value.Value[]): DataExpr[] {
//     return params as DataExpr[];
// }

/*
These are globally defined operators some may eventually be moved to standard library
*/

// TODO break this up into files
// TODO ALWAYS verify input length
// TODO THINK: could this be moved to a standard library?

// Util to convert to boolean value
const toBool = (b : boolean, token: LexerToken) =>
    new value.NumberValue(token, new WasmNumber().fromString(b ? '1' : '0'));

// Type for following type
type MacroOperatorsSpec = {
    [k : string] : {
        action: (ctx: Context, token: LexerToken)
            => Context | Array<string> | undefined | SyntaxError | void;
        type?: types.ArrowType;
    };
};

// Operators that the user shouldn't overload
const operators : MacroOperatorsSpec = {
    // Bind identifier(s) to expression(s)
    '=' : {
        action: (ctx, token) => {
            // Get symbols to bind
            if (ctx.stack.length < 2)
                return ['expected an expression and a binding identifier'];
            const sym = ctx.pop();

            let syms : value.IdValue[];
            if (sym instanceof value.MacroValue) {
                // TODO verify there's enough items when {$a $b} =
                // List of identifiers to pull from stack in reverse order
                const tr = ctx.traceIO(sym, token);
                if (tr instanceof error.SyntaxError)
                    return tr;

                // Take IdValue[]
                if (tr.gives.some(sym => !(sym instanceof value.IdValue)))
                    return ["macro produced invalid results"];
                if (ctx.stack.length < tr.gives.length)
                    return ['not enough values to bind'];
                syms = (tr.gives as value.IdValue[]).reverse().map(s => {
                    // Apply to current scope
                    s.scopes = ctx.scopes.slice();
                    return s;
                });
            } else if (sym instanceof value.IdValue) {
                // Single identifier to pull from stack
                syms = [sym];
            } else {
                // Syntax error
                ctx.pop();
                return ["missing symbol(s) to bind"];
            }

            // Bind idenfiers
            syms.forEach(sym => {
                // Verify no reassign
                let id = sym.value.slice(1);
                const [scope] = sym.scopes.slice(-1);
                if (scope[id])
                    ctx.warn(token, `${id} is already defined in current scope`);

                // Bind identifier
                scope[id] = ctx.pop();
            });
        },
    },

    // Union type operator
    // TODO override for bitwise or
    // TODO convert to function
    '|' : {
        action: (ctx, token) => {
            // Get input
            if (ctx.stack.length < 2)
                return ['expected 2 operands'];
            let b = ctx.pop();
            let a = ctx.pop();
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

    // Puts items in executable array into a tuple
    'pack' : {
        action: (ctx, token) => {
            // Get executable array
            if (ctx.stack.length === 0)
                return ['expected a macro of values to pack'];
            const execArr = ctx.pop();
            if (!(execArr instanceof value.MacroValue))
                return ['expected a macro of values to pack'];

            // Invoke executable array
            const ios = ctx.traceIO(execArr, token);
            if (!(ios instanceof Context.TraceResults))
                return ios;
            const rvs = ios.gives;
            ctx.popn(ios.takes.length);

            // Empty Tuple
            if (rvs.length === 0) {
                ctx.push(new value.TupleValue(token, []));
                return ctx;
            }

            const t0 = rvs[0].type;
            // TODO eventually this could be allowed
            // TODO handle escaped identifiers as wildcards
            const allData = !rvs.some(v => ![value.ValueType.Data, value.ValueType.Expr].includes(v.type));
            if (!allData && rvs.some(v => v.type !== t0))
                return ['incompatible syntactic types passed to pack'];

            // Make tuple
            const ret = t0 === value.ValueType.Type
                ? new value.Value(token, value.ValueType.Type,
                    new types.TupleType(token, rvs.map(v => v.value as types.Type)))
                : new value.TupleValue(token, rvs);
            ctx.push(ret);
        },
    },

    // Make a type wrapper that assigns class tag to output datatype
    'class' : {
        action: (ctx, token) => {
            // Pull a macro or convert to one
            if (ctx.stack.length === 0)
                return ['expected a macro or type'];
            let v = ctx.pop();
            if (v.type == value.ValueType.Type) {
                const cpy = v;
                v = new value.MacroValue(token, new CompilerMacro((ctx, token) => void ctx.push(cpy)));
            }

            // Validate input
            if (!(v instanceof value.MacroValue))
                return ['expected a type or macro to make a class of'];
            if (v.value.recursive)
                return ['recursive types currently not supported'];

            // Generate new class
            const id = new types.ClassType(token, null).id;

            // Wrap macro with one that appends class type to return value
            const wrapper = (ctx: Context, tok: LexerToken) => {
                // TODO i think scoping is fucked :/
                // Invoke v
                const oldStack = ctx.stack.slice();
                const ev = v.value.action(ctx, token);
                if (typeof ev === 'object' && !(ev instanceof Context))
                    return ev;
                // console.log('ev', ev);

                // Assert that macro returns a single type
                // TODO use ctx.traceIO() instead
                const retlen = ctx.stack.length - ctx.cmpStack(oldStack);
                if (retlen > 1)
                    return ['type macro should only return one value']; // TODO need to find a way to improve error tracing
                const t = ctx.pop();
                if (t.type !== value.ValueType.Type)
                    return ['expected a type to append class to'];

                // Use class wrapper
                ctx.push(
                    new value.Value(token, value.ValueType.Type,
                        new types.ClassType(token, t.value, id)));
            };

            // Push
            ctx.push(new value.MacroValue(token, new CompilerMacro(wrapper)));
        },
    },

    // Unpack a tuple
    'unpack' : {
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
                if (v.value instanceof value.TupleValue)
                    v.value.value.forEach(val => ctx.push(val));

                // TODO probably more ways to have tuple exprs...
                else {console.log(v);
                    return ['unexpected runtime-expr'];
                }
            } else {
                return ['expected a tuple to unpack'];
            }
        },
    },

    // Assign classes to value, instantate class
    // TODO Exprs
    // TODO make this a function
    'make' : {
        action: (ctx, token) => {
            // TODO Check base type compatible ?
            // Get type
            if (ctx.stack.length < 2)
                return ['not enough values']
            const t = ctx.pop();
            if (t.type !== value.ValueType.Type)
                return ['expected a class to apply'];

            // Get data
            const v = ctx.pop();
            if (![value.ValueType.Data, value.ValueType.Expr].includes(v.type))
                return ['expected data to apply class to'];

            // Apply class to data
            const compatible = t.value.getBaseType().check(v.datatype);
            if (!compatible) {
                // console.log('make: incompatible', t.value, t.value.getBaseType(), v.datatype);
                ctx.warn(token, 'class applied to incompatible data');
            }
            v.datatype = t.value;
            ctx.push(v);
        },
    },

    // Get the datatype of a value
    'type' : {
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

    // Make variable reference global
    'global' : {
        action: (ctx: Context, token: LexerToken) => {
            // Change reference at back of stack to use global scope
            if (ctx.stack.length === 0)
                return ['expected a reference to globalize'];
            const v = ctx.pop();
            if (!(v instanceof value.IdValue))
                return ['expected identifier'];
            v.scopes = [ctx.globals];
            ctx.push(v);
        },
    },

    // Function operator
    'fun' : {
        action: (ctx: Context, token: LexerToken) => {
            // Get operands
            if (ctx.stack.length < 3)
                return ['expected a condtion action and symbol'];
            const sym = ctx.pop();
            if (!(sym instanceof value.IdValue))
                return ['expected a symbol'];
            const action = ctx.pop();
            if (!(action instanceof value.MacroValue))
                return ['expected a macro action'];
            const condition = ctx.pop();
            if (!(condition instanceof value.MacroValue))
                return ['expected a macro condition'];

            // Bind Symbol
            const v = ctx.getId(sym.value.slice(1), sym.scopes);
            if (!v) {
                // New function
                sym.scopes[sym.scopes.length - 1][sym.value.slice(1)] =
                    new value.Value(token, value.ValueType.Fxn,
                        new Fun(token, condition, action, sym.value.slice(1)));
                return;
            } else if (v.type === value.ValueType.Fxn) {
                // Pre-existing function to overload
                v.value.overload(token, condition, action);
                return;
            } else {
                return ['symbol currently stores unfun value'];
            }
        },
    },

    // Export a function as wasm
    // {I32 I32} { + } $add export
    'export' : {
        action: (ctx: Context, token: LexerToken) => {
            // Get operands
            if (ctx.stack.length < 3)
                return ['not enough values'];
            const sym = ctx.pop();
            if (sym.type !== value.ValueType.Id)
                return ['expected a symbol'];
            const act = ctx.pop();
            if (!(act instanceof value.MacroValue))
                return ['expected macro'];
            const args = ctx.pop();
            if (!(args instanceof value.MacroValue))
                return ['expected macro'];

            // Get input types
            const ev = ctx.traceIO(args, token);
            if (!(ev instanceof Context.TraceResults))
                return ev;
            const inputs = ev.gives;
            if (inputs.some(t => t.type !== value.ValueType.Type))
                return ['expected a macro of types'];
            const inTypes: types.Type[] = inputs.map(t => t.value);

            // Put param exprs onto stack
            const out = new expr.FunExportExpr(token, sym.value.slice(1), inTypes);
            let nonVoidIndex = 0;
            const pes = inTypes.map((t) => new expr.ParamExpr(token, t, out, t.isVoid() ? -1 : nonVoidIndex++));
            ctx.push(...pes);

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

            for (let i = 0; i < pes.length; i++)
                ctx.pop();
        },
    },

    // Functor type
    'Arrow' : {
        action: (ctx: Context, token: LexerToken) => {
            // Get operands
            if (ctx.stack.length < 2)
                return ['not enough values'];
            const outputsMacro = ctx.pop();
            const inputsMacro = ctx.pop();
            if (!(outputsMacro instanceof value.MacroValue) || !(inputsMacro instanceof value.MacroValue))
                return ['expected two macros for input and output types'];

            // Get input types
            const ev = ctx.traceIO(inputsMacro, token);
            if (!(ev instanceof Context.TraceResults))
                return ev;
            ev.gives = ev.gives.slice(0, Math.abs(ev.delta));
            if (ev.gives.some(v => v.type !== value.ValueType.Type))
                return ['expected all input types to be types'];
            const inputs : types.Type[] = ev.gives.map(t => t.value);

            // Get output types
            const ev2 = ctx.traceIO(outputsMacro, token);
            if (!(ev2 instanceof Context.TraceResults))
                return ev2;
            ev2.gives = ev2.gives.slice(0, Math.abs(ev2.delta));
            if (ev2.gives.some(v => v.type !== value.ValueType.Type))
                return ['expected all output types to be types'];
            const outputs : types.Type[] = ev2.gives.map(t => t.value);

            // Push Type onto the stack
            const type = new types.ArrowType(token, inputs, outputs);
            ctx.push(new value.Value(token, value.ValueType.Type, type));
        },
    },

    // Void datatype, stores no values, only accepts empty tuple
    'Void' : {
        action: (ctx, token) => {
            ctx.push(new value.Value(token, value.ValueType.Type, new types.TupleType(token, [])));
        },
    },

    // Import
    'import' : {
        action: (ctx: Context, token: LexerToken) => {
            // Get operands
            if (ctx.stack.length < 2)
                return ['not enough values'];
            const scopes = ctx.pop();
            const type = ctx.pop();
            if (!(scopes instanceof value.MacroValue))
                return ['expected an executable array of scopes'];
            if (type.type !== value.ValueType.Type)
                return ['expected a type for the input'];
            if (!(type.value instanceof types.ArrowType))
                return ['expected an arrow type for the import'];

            // Get scopes
            const traceResults = ctx.traceIO(scopes, token);
            if (!(traceResults instanceof Context.TraceResults))
                return traceResults;
            if (traceResults.gives.some(s => !(s instanceof value.StrValue)))
                return ['expected an executable array of string scopes'];
            const scopeStrs = traceResults.gives.map(s => s.value) as string[];

            // Add relevant import
            const importName = ctx.module.addImport(scopeStrs, type.value);
            if (!importName)
                return ["invalid import"];

            // Wrap import call in a macro
            ctx.push(new value.MacroValue(token, new CompilerMacro((ctx, token) => {
                // Verify matching input types
                const inputs: value.Value[] = [];
                if (ctx.stack.length < type.value.inputTypes.length)
                    return ['not enough values'];
                for (let i = type.value.inputTypes.length - 1; i >= 0; i--) {
                    const v = ctx.pop();
                    if (!v.datatype || !type.value.inputTypes[i].check(v.datatype)) {
                        console.log(v, type.value.inputTypes[i]);
                        return ['incompatible value passed to imported function call'];
                    }
                    inputs.push(v);
                }
                inputs.reverse();

                // Make call
                ctx.push(new expr.InstrExpr(token, type.value.outputTypes[0], `call ${importName} `, expr.fromDataValue(inputs)));
            }), type.value));
        },
    },

    // Mark as recursive
    'rec' : {
        action: (ctx: Context, token: LexerToken) => {
            if (ctx.stack.length === 0)
                return ['missing value'];
            const arg = ctx.pop();
            if (arg.value instanceof Fun || arg.value instanceof LiteralMacro) {
                arg.value.recursive = true;
                ctx.push(arg);
            } else {
                return ['expected a macro or function to mark as recursive'];
            }
        },
    },

    // Namespaces
    'namespace' : {
        action: (ctx: Context, token: LexerToken) => {
            // Pull macro
            if (ctx.stack.length === 0)
                return ['missing value'];
            const arg = ctx.pop();
            if (!(arg.value instanceof LiteralMacro))
                return ['expected a macro literal'];

            // Create ns
            const ns = arg.value.getNamespace(ctx, token);
            if (ns instanceof value.MacroValue)
                ctx.push(ns);
            else
                return ns;
        },
    },

    // Promote all members of namespace to current scope
    'use' : {
        action: (ctx: Context, token: LexerToken) => {
            // Get namespace
            if (ctx.stack.length === 0)
                return ['missing namespace'];
            const ns = ctx.pop();
            if (!(ns instanceof value.MacroValue && ns.value instanceof NamespaceMacro))
                return ['expected a namespace'];

            // Promote members
            ns.value.promote(ctx, token);
        },
    },

    // Promote some of the members of a namespace to current scope
    // <namespace> <include rxp> <exclude rxp> use_some
    'use_some' : {
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
            if (!(ns instanceof value.MacroValue && ns.value instanceof NamespaceMacro))
                return ['expected a namespace'];

            // Promote members
            ns.value.promote(ctx, token, include.value, exclude.value);
        }
    },

    // Include another file as a module
    'include' : {
        action: (ctx: Context, token: LexerToken) => {
            // Get argument
            if (ctx.stack.length === 0)
                return ['no value'];
            const arg = ctx.pop();
            if (!(arg instanceof value.StrValue))
                return ['expected a string path'];

            // Get full-path
            const curDir = token.file ? path.parse(token.file).dir : '.';
            let realpath : string;
            try {
                realpath = fs.realpathSync(path.normalize(path.join(curDir, arg.value)));
            } catch (e: any) {
                return new error.SyntaxError(`include: ${e && e.message}`, token, ctx);
            }

            // Check if already included
            // If so give user the cached namespace
            if (ctx.includedFiles[realpath]) {
                ctx.push(new value.MacroValue<NamespaceMacro>(
                    token,
                    ctx.includedFiles[realpath]));
                return;
            }

            // Load file
            const tokens = scan(fs.readFileSync(realpath).toString(), realpath);

            // Put file into a macro
            const block = new BlockToken('{', token.position, token.file || curDir);
            block.token = token.token;
            block.body  = tokens;

            // Convert file into namespace and push it
            const ns = new LiteralMacro(ctx, block).getNamespace(ctx, token);
            if (!(ns instanceof value.MacroValue))
                return ns;
            ctx.push(ns);
            ctx.includedFiles[realpath] = ns.value;
        },
    },

    // Is the value known at compile-time
    'is_const' : {
        action: (ctx: Context, token: LexerToken) => {
            // Only expressions are
            if (ctx.stack.length === 0)
                return ['missing value'];
            const arg = ctx.pop();
            ctx.push(toBool(!(arg instanceof expr.Expr), token))
        },
    },

    // Does the value have a datatype?
    'has_type': {
        action: (ctx, token) => {
            if (ctx.stack.length === 0)
                return ['missing value'];
            const arg = ctx.pop();
            ctx.push(toBool(!!arg.datatype, token));
        },
    },

    // Defer results of calculations invloving this value until runtime
    'defer' : {
        action: (ctx: Context, token: LexerToken) => {
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

    // ASM instruction
    'asm' : {
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
    '_asm' : {
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
            const { inputTypes, outputTypes } = sig.value;
            if (ctx.stack.length < inputTypes.length)
                return ['not enough inputs given'];
            const inputs = ctx.popn(inputTypes.length).reverse();
            if (!inputs.reduce((r, v, i) => r && inputTypes[i].check(v.datatype), true))
                return ['invalid input types received'];

            // Create expression
            if (outputTypes.length > 1) {
                const e = new expr.MultiInstrExpr(token, mnemonic.value, fromDataValue(inputs), outputTypes);
                ctx.push(...e.results);
            } else {
                ctx.push(new expr.InstrExpr(token, outputTypes[0], mnemonic.value, fromDataValue(inputs)));
            }
        },
    },

    // Moving typechecking behavior from == to here
    'typecheck' : {
        action: (ctx, token) => {
            if (ctx.stack.length < 2)
                return ['missing values'];
            const [a, b] = ctx.popn(2);
            ctx.push(toBool(b.value.check(a.value), token));
        }
    }
};

// Condition for two numeric types
// This macro returns 1 when the top two values on the stack are numbers and 0 otherwise
const numberCheck = new value.MacroValue(null, new CompilerMacro((ctx, token) => {
    // Pull args
    if (ctx.stack.length < 2)
        return [`expected two numbers but only received ${ctx.stack.length} values`];
    const b = ctx.pop();
    const a = ctx.pop();

    // Return result of type-check
    const numberType = new types.UnionType(null, [
        types.PrimitiveType.Types.I32,
        types.PrimitiveType.Types.I64,
        types.PrimitiveType.Types.F32,
        types.PrimitiveType.Types.F64,
    ]);
    const synTypes = [value.ValueType.Data, value.ValueType.Expr];
    const ret = synTypes.includes(a.type) && synTypes.includes(b.type)
        && numberType.check(b.datatype) && numberType.check(a.datatype)
        && (b.datatype.check(a.datatype) || a.datatype.check(b.datatype));
    ctx.push(toBool(ret, token));
}));

// Global functions that the user can overload
const funs = {
    // Invoke operator: dreference/unescape a symbol
    '@' : new value.Value(null, value.ValueType.Fxn, new Fun(
        null,
        new value.MacroValue(null, new CompilerMacro((ctx, token) => {
            if (!ctx.pop())
                return ['missing argument'];
            ctx.push(toBool(true, token));
        })),
        new value.MacroValue(null, new CompilerMacro((ctx, token) => {
            let v = ctx.pop();
            if (v instanceof value.IdValue)
                v = v.deref(ctx);
            return ctx.invoke(v, token);
        })),
        '@',
    )),

    // Dereference operator: dereference a symbol (equivalent to @ except doesn't invoke macros + functions)
    '~' : new value.Value(null, value.ValueType.Fxn, new Fun(
        null,
        new value.MacroValue(null, new CompilerMacro((ctx, token) => {
            if (!ctx.pop())
                return ['missing argument'];
            ctx.push(toBool(true, token));
        })),
        new value.MacroValue(null, new CompilerMacro((ctx, token) => {
            const sym = ctx.pop();
            if (!(sym instanceof value.IdValue))
                return ['expected an escaped identifier to extract value from'];
            const v = sym.deref(ctx);
            if (!v)
                return ['undefined'];
            v.token = token;
            ctx.push(v);
        })),
        '~',
    )),

    // Default ==
    // TODO Expr
    '==' : new value.Value(null, value.ValueType.Fxn, new Fun(
        null,
        new value.MacroValue(null, new CompilerMacro((ctx, token) => {
            // Pull args
            if (ctx.stack.length < 2)
                return ['expected two expressions to compare'];
            const b = ctx.pop();
            const a = ctx.pop();

            // Check syntax types
            const isData = ![a, b].some(v =>
                !(v instanceof value.DataValue || v instanceof expr.DataExpr));
            if (a.type !== b.type && !isData) {
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
        })),
        new value.MacroValue(null, new CompilerMacro((ctx, token) => {
            // Pull args
            if (ctx.stack.length < 2)
                return ['expected two expressions to compare'];
            const b = ctx.pop();
            const a = ctx.pop();
            const isData = ![a, b].some(v => ![value.ValueType.Expr, value.ValueType.Data].includes(v.type));
            if (!isData && a.type !== b.type)
                return [`disparate types ${a.type} ${b.type} ==`];

            // Handle
            switch (a.type) {
                // Typechecking
                case value.ValueType.Type:
                    ctx.push(toBool(b.value.check(a.value), token));
                    break;

                // Value comparison
                case value.ValueType.Data: {
                    // Cannot compare incompatible datatypes
                    if (!b.datatype.check(a.datatype))
                        return ['incompatible types'];

                    // Non-primitives
                    const aType = a.datatype.getBaseType();
                    const bType = b.datatype.getBaseType();
                    if (!(aType instanceof types.PrimitiveType))
                        return ['builtin == only accepts primitives (overload $== global fun)'];
                    if (!(bType instanceof types.PrimitiveType))
                        return ['builtin == only accepts primitives (overload $== global fun)'];

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
                                expr.fromDataValue([b])
                            ));
                        } else {
                            ctx.push(new expr.InstrExpr(
                                token,
                                types.PrimitiveType.Types.I32,
                                `${aType.name}.eq`,
                                expr.fromDataValue([a, b])
                            ));
                        }
                        return;
                    }
                    throw "wtf?";
                }

                // TODO expr
                case value.ValueType.Expr: {
                    // Cannot compare incompatible datatypes
                    if (!b.datatype.check(a.datatype))
                        return ['incompatible types'];

                    // Non-primitives
                    const aType = a.datatype.getBaseType();
                    const bType = b.datatype.getBaseType();
                    if (!(aType instanceof types.PrimitiveType))
                        return ['builtin == only accepts primitives (overload $== global fun)'];
                    if (!(bType instanceof types.PrimitiveType))
                        return ['builtin == only accepts primitives (overload $== global fun)'];

                    if (b.type === value.ValueType.Data && a.value.value === BigInt(0)) {
                        ctx.push(new expr.InstrExpr(
                            token,
                            types.PrimitiveType.Types.I32,
                            `${aType.name}.eqz`,
                            expr.fromDataValue([a])
                        ));
                    } else {
                        ctx.push(new expr.InstrExpr(
                            token,
                            types.PrimitiveType.Types.I32,
                            `${aType.name}.eq`,
                            expr.fromDataValue([a, b])
                        ));
                    }
                    return;
                }

                // Invalid syntax type passed
                default:
                    return ['syntax error'];
            }
        })),
        '==',
    )),

    // TODO maybe use make instead?
    'as' : new value.Value(null, value.ValueType.Fxn, new Fun(
        null,
        new value.MacroValue(null, new CompilerMacro((ctx, token) => {
            // macro + any datatype
            const type = ctx.pop();
            const v = ctx.pop();
            if (type.type !== value.ValueType.Type)
                return ctx.push(toBool(false, token));
            else if (!(v instanceof value.MacroValue))
                return ['as operator currently can only apply types to macros'];
            else
                return ctx.push(toBool(true, token));
        })),
        new value.MacroValue(null, new CompilerMacro((ctx, token) => {
            // Get args
            const type = ctx.pop();
            const value = ctx.pop();

            // Assume it's arrow type, if not, convert it to one
            // Do typecheck:
                // Copy stack and put input types onto it
                // Invoke macro
                // Verify results are correct
                // TODO probably should have something dedicated to this in Context/Macro

            // TODO this is placeholder
            value.datatype = type.value;
            ctx.push(value);
        })),
        'as',
    )),
};

// Export map of macros
const exportsObj = Object.entries(operators).reduce((ret, [k, v]) =>
    ({
        ...ret,
        [k] : new value.MacroValue(
            null,
            new CompilerMacro(v.action),
            v.type || undefined,
        ),
    }), {});

// Add some other values as well
export default {
    ...exportsObj,
    ...funs,
};