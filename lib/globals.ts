import * as value from './value'
import * as types from './datatypes'
import * as expr from './expr'
import Macro from './macro'
import Context from './context'
import WasmNumber from './numbers'
import Fun from './function'

/*
These are globally defined operators some may eventually be moved to standard library
*/

// TODO break this up into files
// TODO ALWAYS verify input length
// TODO Move some to standard library

// Util to convert to boolean value
const toBool = (b, token) => new value.NumberValue(token, new WasmNumber().fromString(b ? '1' : '0'));

// Operators that the user shouldn't overload
const operators = {
    // Boolean literals
    'false' : {
        action: (ctx, token) => {
            ctx.push(toBool(false, token));
        },
    },
    'true' : {
        action: (ctx, token) => {
            ctx.push(toBool(true, token));
        },
    },

    // Everything above here should probably be moved to standard library

    // Bind identifier to expression
    '=' : {
        action: (ctx, token) => {
            // Get identifier
            if (ctx.stack.length < 2)
                return ['expected an expression and a binding identifier'];
            const sym = ctx.pop();
            if (sym.type !== value.ValueType.Id) {
                ctx.pop();
                return ["missing symbol to bind"];
            }

            // Verify no reassign
            let id = sym.value.slice(1);
            const [scope] = sym.scopes.slice(-1);
            if (scope[id])
                ctx.warn(token, `${id} is already defined in current scope`);

            // Bind identifier
            scope[id] = ctx.pop();
        },
    },

    // Union type operator
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

            a = a.value;
            b = b.value;

            // Create type union
            const ret = new types.UnionType(token, []);
            ret.types = (a instanceof types.UnionType ? a.types : [a])
                    .concat(b instanceof types.UnionType ? b.types : [b]);
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
            if (execArr.type !== value.ValueType.Macro)
                return ['expected a macro of values to pack'];

            // Invoke executable array
            const stackCpy = ctx.stack.slice();
            const ev = execArr.value.action(ctx, token);
            if (typeof ev === 'object' && !(ev instanceof Context))
                return ev;

            // Get return values
            // TODO BUG 5 { $v = v v } pack GIVES 5 { 5 }
            //  should probably remedy this by utilizing ctx.minStackSize or ctx.traceIO()
            const rvs = ctx.stack.slice(ctx.cmpStack(stackCpy));
            ctx.popn(rvs.length);

            if (rvs.length === 0)
                return ['pack expected at least one value to pack'];
            const t0 = rvs[0].type;
            // TODO eventually this could be allowed
            // TODO handle escaped identifiers as wildcards
            const allData = !rvs.some(v => ![value.ValueType.Data, value.ValueType.Expr].includes(v.type));
            if (!allData && rvs.some(v => v.type !== t0))
                return ['incompatible syntactic types passed to pack'];

            // Make tuple
            const ret = t0 === value.ValueType.Type
                ? new value.Value(token, value.ValueType.Type,
                    new types.TupleType(token, rvs.map(v => v.value)))
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
            if (v.type === value.ValueType.Type) {
                const v2 = v;
                v = new value.Value(token, value.ValueType.Macro,
                    new Macro((ctx, token) => ctx.push(v2), ctx));
            }

            // Assert macro type
            if (v.type !== value.ValueType.Macro)
                return ['expected a macro or type'];

            const id = new types.ClassType(token, null).id;

            // Wrap macro with one that appends class type to return value
            const wrapper = (ctx, tok) => {
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
            ctx.push(new value.Value(token, value.ValueType.Macro, new Macro(wrapper, ctx)));
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
                else
                    return ['unexpected runtime-expr'];
            } else {
                return ['expected a tuple to unpack'];
            }
        },
    },

    // Assign classes to value, instantate class
    // TODO Exprs
    'make' : {
        action: (ctx, token) => {
            // TODO Check base type compatible ?
            // Get type
            const t = ctx.pop();
            if (t.type !== value.ValueType.Type)
                return ['expected a class to apply'];

            // Get data
            const v = ctx.pop();
            if (![value.ValueType.Data, value.ValueType.Expr].includes(v.type))
                return ['expected data to apply class to'];

            // Apply class to data
            const compatible = t.value.getBaseType().check(v.datatype);
            if (!compatible)
                ctx.warn(token, 'class applied to incompatible data');
            v.datatype = t.value;
            ctx.push(v);
        },
    },

    // Get the datatype of a value
    // TODO exprs
    'type' : {
        action: (ctx, token) => {
            if (ctx.stack.length === 0)
                return ['expected an expression to get type from'];
            const v = ctx.pop();
            if (![value.ValueType.Data, value.ValueType.Expr].includes(v.type))
                return ['expected data'];
            ctx.push(new value.Value(token, value.ValueType.Type, v.datatype));
        },
    },

    // Make variable reference global
    'global' : {
        action: (ctx, token) => {
            // Change reference at back of stack to use global scope
            if (ctx.stack.length === 0)
                return ['expected a reference to globalize'];
            const v = ctx.pop();
            if (v.type !== value.ValueType.Id)
                return ['expected identifier'];
            v.scopes = [ctx.globals];
            ctx.push(v);
        },
    },

    // Function operator
    'fun' : {
        action: (ctx, token) => {
            // Get operands
            if (ctx.stack.length < 3)
                return ['expected a condtion action and symbol'];
            const sym = ctx.pop();
            if (sym.type !== value.ValueType.Id)
                return ['expected a symbol'];
            const action = ctx.pop();
            if (action.type !== value.ValueType.Macro)
                return ['expected a macro action'];
            const condition = ctx.pop();
            if (condition.type !== value.ValueType.Macro)
                return ['expected a macro condition'];

            // Bind Symbol
            const v = ctx.getId(sym.value.slice(1), sym.scopes);
            if (!v) {
                // New function
                sym.scopes[sym.scopes.length - 1][sym.value.slice(1)] =
                    new value.Value(token, value.ValueType.Fxn,
                        new Fun(token, condition, action));
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
    // {I32 I32} { + } $add target
    'target' : {
        action: (ctx, token) => {
            // Get operands
            const sym = ctx.pop();
            if (sym.type !== value.ValueType.Id)
                return ['expected a symbol'];
            const act = ctx.pop();
            if (act.type !== value.ValueType.Macro)
                return ['expected macro'];
            const args = ctx.pop();
            if (args.type !== value.ValueType.Macro)
                return ['expected macro'];


            // Get input types
            const ev = ctx.traceIO(args, token);
            if (!(ev instanceof Context.TraceResults))
                return ev;
            const inputs = ev.gives;
            if (inputs.some(t => t.type !== value.ValueType.Type))
                return ['expected a macro of types'];
            const inTypes = inputs.map(t => t.value);

            // Put opaque param exprs onto stack
            const out = new expr.FunExportExpr(token, sym.value.slice(1), inTypes);
            const pes = inTypes.map((t, i) => new expr.ParamExpr(token, t, out, i)).reverse();
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

            ctx.exports.push(out);
        },
    },
};

// Condition for two numeric types
// This macro returns 1 when the top two values on the stack are numbers and 0 otherwise
const numberCheck = new value.Value(null, value.ValueType.Macro, new Macro((ctx, token) => {
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
    // TODO exprs
    '+' : new value.Value(null, value.ValueType.Fxn, new Fun(
        null,
        numberCheck,
        new value.Value(null, value.ValueType.Macro, new Macro((ctx, token) => {
            // Get args
            const b = ctx.pop();
            const a = ctx.pop();

            const exprs = [a, b].map(v => v.type === value.ValueType.Expr);
            if (!exprs.includes(true))
                // Simplify constexprs
                ctx.push(new value.NumberValue(token, a.value.clone().add(b.value)));
            else if (exprs[0] === exprs[1])
                // Neither is a constexpr
                ctx.push(new expr.InstrExpr(token, b.datatype, `${a.datatype.getBaseType().name}.add`, [a, b]));
            else if (!exprs[0])
                // A is const, try to optimize
                // adding zero is identity
                ctx.push(a.value.value == 0
                    ? b
                    : new expr.InstrExpr(token, b.datatype, `${a.datatype.getBaseType().name}.add`, [a, b]));
            else // if (!exprs[1])
                // B is const, try to optimize
                // Adding zero is identity
                ctx.push(b.value.value == 0
                    ? a
                    : new expr.InstrExpr(token, b.datatype, `${a.datatype.getBaseType().name}.add`, [a, b]));
        })),
    )),
    '*' : new value.Value(null, value.ValueType.Fxn, new Fun(
        null,
        numberCheck,
        new value.Value(null, value.ValueType.Macro, new Macro((ctx, token) => {
            const b = ctx.pop();
            const a = ctx.pop();

            const exprs = [a, b].map(v => v.type === value.ValueType.Expr);
            if (!exprs.includes(true))
                // Simplify constexprs
                ctx.push(new value.NumberValue(token, a.value.clone().mul(b.value)));
            else if (exprs[0] === exprs[1]) {
                // Neither is a constexpr
                const type = a.datatype.getBaseType().name;
                ctx.push(new expr.InstrExpr(token, b.datatype, `${type}.mul`, [a, b]));
            } else if (!exprs[0])
                // A is const, try to optimize
                // mul by 1 is identity
                // mul by 0 is 0
                ctx.push(a.value.value == 1
                    ? b
                    : a.value.value == 0
                        ? a
                        : new expr.InstrExpr(token, b.datatype, `${a.datatype.getBaseType().name}.mul`, [a, b]));
            else // if (!exprs[1])
                // B is const, try to optimize
                // mul by 1 is identity
                // mul by 0 is 0
                ctx.push(b.value.value == 1
                    ? a
                    : b.value.value == 0
                        ? b
                        : new expr.InstrExpr(token, b.datatype, `${a.datatype.getBaseType().name}.mul`, [a, b]));
        })),
    )),
    '%' : new value.Value(null, value.ValueType.Fxn, new Fun(
        null,
        numberCheck,
        new value.Value(null, value.ValueType.Macro, new Macro((ctx, token) => {
            // Pull args
            const b = ctx.pop();
            const a = ctx.pop();

            // Check constexprs
            const exprs = [a, b].map(v => v.type === value.ValueType.Expr);

            // Check ct mod 0
            if (!exprs[1] && b.value.value == 0)
                return ['divide by zero (remainder)'];

            // Compile vs run time
            if (!exprs.includes(true)) {
                // Simplify constexprs
                ctx.push(new value.NumberValue(token, a.value.clone().mod(b.value)));
            } else {
                // Neither is a constexpr

                const type = a.datatype.getBaseType().name;
                ctx.push(new expr.InstrExpr(token, b.datatype, `${type}.rem${type[0] === 'f' ? '' : '_s'}`, [a, b]));
            }
        })),
    )),
    '-' : new value.Value(null, value.ValueType.Fxn, new Fun(
        null,
        numberCheck,
        new value.Value(null, value.ValueType.Macro, new Macro((ctx, token) => {
            // Get args
            const b = ctx.pop();
            const a = ctx.pop();

            // Check constexprs
            const exprs = [a, b].map(v => v.type === value.ValueType.Expr);
            if (!exprs.includes(true))
                // Simplify constexprs
                ctx.push(new value.NumberValue(token, a.value.clone().sub(b.value)));
            else if (exprs[1])
                // Neither is a constexpr
                ctx.push(new expr.InstrExpr(token, b.datatype, `${a.datatype.getBaseType().name}.sub`, [a, b]));
            else // if (!exprs[1] && exprs[0])
                // B is const, try to optimize
                // Subtracting zero is identity
                ctx.push(b.value.value == 0
                    ? a
                    : new expr.InstrExpr(token, b.datatype, `${a.datatype.getBaseType().name}.sub`, [a, b]));
        })),
    )),
    '/' : new value.Value(null, value.ValueType.Fxn, new Fun(
        null,
        numberCheck,
        new value.Value(null, value.ValueType.Macro, new Macro((ctx, token) => {
            // Get args
            const b = ctx.pop();
            const a = ctx.pop();

            // Check constexprs
            const exprs = [a, b].map(v => v.type === value.ValueType.Expr);

            // Check ct div 0
            if (!exprs[1] && b.value.value == 0)
                return ['divide by zero'];

            // Compile vs Runtime
            if (!exprs.includes(true)) {
                // Simplify constexprs
                ctx.push(new value.NumberValue(token, a.value.clone().div(b.value)));
            } else if (exprs[1]) {
                // Neither is a constexpr
                const type = a.datatype.getBaseType().name;
                ctx.push(new expr.InstrExpr(token, b.datatype, `${type}.div${type[0] === 'f' ? "" : "_s"}`, [a, b]));
            } else { // if (!exprs[1] && exprs[0])
                // B is const, try to optimize
                // Divide by 1 is identity
                ctx.push(b.value.value == 1
                    ? a
                    : new expr.InstrExpr(token, b.datatype, `${a.datatype.getBaseType().name}.div`, [a, b]));
            }
        })),
    )),

    // Invoke operator: dreference/unescape a symbol
    '@' : new value.Value(null, value.ValueType.Fxn, new Fun(
        null,
        new value.Value(null, value.ValueType.Macro, new Macro((ctx, token) => {
            if (!ctx.pop())
                return ['missing argument'];
            ctx.push(toBool(true, token));
        })),
        new value.Value(null, value.ValueType.Macro, new Macro((ctx, token) => ctx.invoke(ctx.pop(), token))),
    )),

    // Dereference operator: dereference a symbol (equivalent to @ except doesn't invoke macros + functions)
    '~' : new value.Value(null, value.ValueType.Fxn, new Fun(
        null,
        new value.Value(null, value.ValueType.Macro, new Macro((ctx, token) => {
            if (!ctx.pop())
                return ['missing argument'];
            ctx.push(toBool(true, token));
        })),
        new value.Value(null, value.ValueType.Macro, new Macro((ctx, token) => {
            const sym = ctx.pop();
            if (sym.type !== value.ValueType.Id) {
                ctx.push(sym);
                return;
            }
            const v = ctx.getId(sym.value.slice(1), sym.scopes);
            if (!v)
                return ['undefined'];
            v.token = token;
            ctx.push(v);
        })),
    )),

    // Default ==
    // TODO Expr
    '==' : new value.Value(null, value.ValueType.Fxn, new Fun(
        null,
        new value.Value(null, value.ValueType.Macro, new Macro((ctx, token) => {
            // Pull args
            if (ctx.stack.length < 2)
                return ['expected two expressions to compare'];
            const b = ctx.pop();
            const a = ctx.pop();

            // Check syntax types
            const isData = ![a, b].some(v =>
                ![value.ValueType.Data, value.ValueType.Expr].includes(v.type));
            if (a.type !== b.type && !isData) {
                return ['invalid syntax'];
            }

            // Check datatypes
            if (isData && !b.datatype.check(a.datatype)) {
                console.log({a, b});
                return ['incompatible types'];
            }

            // Continue
            ctx.push(toBool(true, token));
        })),
        new value.Value(null, value.ValueType.Macro, new Macro((ctx, token) => {
            // Pull args
            if (ctx.stack.length < 2)
                return ['expected two expressions to compare'];
            const b = ctx.pop();
            const a = ctx.pop();
            const isData = ![a, b].some(v => ![value.ValueType.Expr, value.ValueType.Data].includes(v.type));
            if (!isData && a.type !== b.type) {
                return [`disparate types ${a.type} ${b.type} ==`];
            }

            // Handle
            switch (a.type) {
                // Typechecking
                case value.ValueType.Type:
                    ctx.push(toBool(b.value.check(a.value), token));
                    break;

                // Value comparison
                case value.ValueType.Data:
                    // Cannot compare incompatible datatypes
                    if (!b.datatype.check(a.datatype))
                        return ['incompatible types'];

                    // Non-primitives
                    if (!(a.datatype.getBaseType() instanceof types.PrimitiveType))
                        return ['you have to overload the $== fun for this datatype'];

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
                                `${b.datatype.getBaseType().name}.eqz`,
                                [b]
                            ));
                        } else {
                            ctx.push(new expr.InstrExpr(
                                token,
                                types.PrimitiveType.Types.I32,
                                `${a.datatype.getBaseType().name}.eq`,
                                [a, b]
                            ));
                        }
                        return;
                    }
                    throw "wtf?";

                // TODO expr
                case value.ValueType.Expr:
                    // Cannot compare incompatible datatypes
                    if (!b.datatype.check(a.datatype))
                        return ['incompatible types'];

                    if (a.type === value.ValueType.Data && a.value.value === BigInt(0)) {
                        ctx.push(new expr.InstrExpr(
                            token,
                            types.PrimitiveType.Types.I32,
                            `${a.datatype.getBaseType().name}.eqz`,
                            [a]
                        ));
                    } else {
                        ctx.push(new expr.InstrExpr(
                            token,
                            types.PrimitiveType.Types.I32,
                            `${a.datatype.getBaseType().name}.eq`,
                            [a, b]
                        ));
                    }
                    return;

                // Invalid syntax type passed
                default:
                    return ['syntax error'];
            }
        })),
    )),

    // TODO _s _u signedness????
    '<' : new value.Value(null, value.ValueType.Fxn, new Fun(
        null,
        numberCheck,
        new value.Value(null, value.ValueType.Macro, new Macro((ctx, token) => {
            // Get args
            const b = ctx.pop();
            const a = ctx.pop();

            // Check constexprs
            const exprs = [a, b].map(v => v.type === value.ValueType.Expr);
            if (!exprs.includes(true))
                // Simplify constexprs
                ctx.push(toBool(a.value.lt(b.value), token));
            else {
                // Result unknown at compile time (probably)
                const type = a.datatype.getWasmTypeName();
                ctx.push(new expr.InstrExpr(
                    token,
                    types.PrimitiveType.Types.I32,
                    `${type}.lt${type[0] === 'i' ? '_s' : ''}`, [a, b]
                ));
            }
        })),
    )),
    '>' : new value.Value(null, value.ValueType.Fxn, new Fun(
        null,
        numberCheck,
        new value.Value(null, value.ValueType.Macro, new Macro((ctx, token) => {
            // Get args
            const b = ctx.pop();
            const a = ctx.pop();

            // Check constexprs
            const exprs = [a, b].map(v => v.type === value.ValueType.Expr);
            if (!exprs.includes(true))
                // Simplify constexprs
                ctx.push(toBool(a.value.gt(b.value), token));
            else {
                // Result unknown at compile time (probably)
                const type = a.datatype.getWasmTypeName();
                ctx.push(new expr.InstrExpr(
                    token,
                    types.PrimitiveType.Types.I32,
                    `${type}.gt${type[0] === 'i' ? '_s' : ''}`, [a, b]
                ));
            }
        })),
    )),
    // TODO comparisons: < >
    // TODO type-casting
    // TODO import, import from js/env
};

// Export map of macros
const exportsObj = Object.entries(operators).reduce((ret, [k, v]) =>
    ({
        ...ret,
        [k] : new value.Value(
            null,
            value.ValueType.Macro,
            new Macro(v.action)),
    }), {});

// Add some other values as well
export default {
    ...exportsObj,
    ...funs,
};