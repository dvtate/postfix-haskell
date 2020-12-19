const value = require('./value');
const types = require('./datatypes');
const Macro = require('./macro');
const Context = require('./context');
const { WasmNumber } = require('./numbers');
const Fun = require('./function');

/*
These are globally defined operators some may eventually be moved to standard library

This file will probably get broken up later
*/

// TODO ALWAYS verify input length
// TODO Move some to standard library
// TODO simplify schema
// TODO convert to overloadable functions

// Util to convert to boolean value
const toBool = (b, token) => new value.NumberValue(token, new WasmNumber().fromString(b ? '1' : '0'));

// User can overload these but they will break everything lmao
const operators = {
    'false' : {
        action: (ctx, token) => {
            ctx.stack.push(toBool(false, token));
        },
    },

    'true' : {
        action: (ctx, token) => {
            ctx.stack.push(toBool(true, token));
        },
    },

    // Everything above here should probably be moved to standard library

    // Bind identifier to expression
    '=' : {
        action: ctx => {
            // Get identifier
            if (ctx.stack.length < 2)
                return ['expected an expression and a binding identifier'];
            const sym = ctx.stack.pop();
            if (sym.type !== value.ValueType.Id) {
                ctx.stack.pop();
                return ["missing symbol to bind"];
            }

            // Verify no reassign
            let id = sym.value.slice(1);
            const [scope] = sym.scopes.slice(-1);
            if (scope[id])
                return [`${id} is already defined in current scope`]; // TODO: show where it was defined

            // Bind identifier
            scope[id] = ctx.stack.pop();
        },
    },

    // Union type operator
    '|' : {
        action: (ctx, token) => {
            // Get input
            if (ctx.stack.length < 2)
                return ['expected 2 operands'];
            let b = ctx.stack.pop();
            let a = ctx.stack.pop();
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
            ctx.stack.push(new value.Value(token, value.ValueType.Type, ret));
        },
    },

    'pack' : {
        action: (ctx, token) => {
            // Get executable array
            if (ctx.stack.length === 0)
                return ['expected a macro of values to pack'];
            const execArr = ctx.stack.pop();
            if (execArr.type !== value.ValueType.Macro)
                return ['expected a macro of values to pack'];

            // Invoke executable array
            const stackCpy = ctx.stack.slice();
            const ev = execArr.value.action(ctx, token);
            if (typeof ev === 'object' && !(ev instanceof Context))
                return ev;

            // Get return values
            const rvs = ctx.stack.splice(ctx.cmpStack(stackCpy));
            if (rvs.length === 0)
                return ['pack expected at least one value to pack'];
            const t0 = rvs[0].type;
            // TODO eventually this could be allowed
            // TODO handle escaped identifiers as wildcards
            if (rvs.some(v => v.type !== t0))
                return ['differing syntactic types passed to pack'];

            // Make tuple
            const ret = t0 === value.ValueType.Data
                ? new value.TupleValue(token, rvs)
                : new value.Value(token, value.ValueType.Type,
                    new types.TupleType(token, rvs.map(v => v.value)));
            ctx.stack.push(ret);
        },
    },

    'class' : {
        action: (ctx, token) => {
            // Pull a macro or convert to one
            if (ctx.stack.length === 0)
                return ['expected a macro or type'];
            let v = ctx.stack.pop();
            if (v.type === value.ValueType.Type) {
                const v2 = v;
                v = new value.Value(token, value.ValueType.Macro,
                    new Macro((ctx, token) => ctx.stack.push(v2), ctx));
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
                const retlen = ctx.stack.length - ctx.cmpStack(oldStack);
                // console.log("rl", retlen);
                // console.log('rs', ctx.stack);
                // console.log('before_s', oldStack);
                if (retlen > 1)
                    return ['type macro should only return one value']; // TODO need to find a way to improve error tracing
                const t = ctx.stack.pop();
                if (t.type !== value.ValueType.Type)
                    return ['expected a type to append class to'];

                // Use class wrapper
                ctx.stack.push(
                    new value.Value(token, value.ValueType.Type,
                        new types.ClassType(token, t.value, id)));
            };

            // Push
            ctx.stack.push(new value.Value(token, value.ValueType.Macro, new Macro(wrapper, ctx)));
        },
    },

    // Unpack a tuple
    'unpack' : {
        action: (ctx, token) => {
            // Pull
            if (ctx.stack.length === 0)
                return ['expected a tuple'];
            const v = ctx.stack.pop();

            // Branch
            if (v.type === value.ValueType.Type) {
                if (!(v instanceof types.TupleType))
                    return ['expected a tuple to unpack'];

                // Push types onto the stack
                v.value.types.forEach(t =>
                    ctx.stack.push(new value.Value(token, value.ValueType.Type, t)));

            } else if (v.type === value.ValueType.Data) {
                if (!(v instanceof value.TupleValue))
                    return ['expected a tuple to unpack'];

                // Push values onto the stack
                v.value.forEach(val => ctx.stack.push(val));

            } else {
                return ['expected a tuple to unpack'];
            }
        },
    },

    // Assign classes to value, instantate class
    'make' : {
        action: (ctx, token) => {
            // TODO Check base type compatible ?
            // Get type
            const t = ctx.stack.pop();
            if (t.type !== value.ValueType.Type)
                return ['expected a class to apply'];

            // Get data
            const v = ctx.stack[ctx.stack.length - 1];
            if (v.type !== value.ValueType.Data)
                return ['expected data to apply class to'];

            // Apply class to data
            const compatible = t.value.getBaseType().check(v.datatype);
            if (!compatible)
                return ['class is incompatible with given data'];
            v.datatype = t.value;
        },
    },

    // Get the datatype of a value
    'type' : {
        action: (ctx, token) => {
            if (ctx.stack.length === 0)
                return ['expected an expression to get type from'];
            const v = ctx.stack.pop();
            if (v.type !== value.ValueType.Data)
                return ['expected data'];
            ctx.stack.push(new value.Value(token, value.ValueType.Type, v.datatype));
        },
    },

    // Make variable reference global
    'global' : {
        action: (ctx, token) => {
            // Change reference at back of stack to use global scope
            if (ctx.stack.length === 0)
                return ['expected a reference to globalize'];
            const v = ctx.stack[ctx.stack.length - 1];
            if (v.type !== value.ValueType.Id)
                return ['expected identifier'];
            v.scopes = [ctx.globals];
        },
    },

    // Function operator
    'fun' : {
        action: (ctx, token) => {
            // Get operands
            if (ctx.stack.length < 3)
                return ['expected a condtion action and symbol'];
            const sym = ctx.stack.pop();
            if (sym.type !== value.ValueType.Id)
                return ['expected a symbol'];
            const action = ctx.stack.pop();
            if (action.type !== value.ValueType.Macro)
                return ['expected a macro action'];
            const condition = ctx.stack.pop();
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
};

// This macro returns 1 when the top two values on the stack are numbers and 0 otherwise
const numberCheck = new value.Value(null, value.ValueType.Macro, new Macro((ctx, token) => {
    // Pull args
    if (ctx.stack.length < 2)
        return [`expected two numbers but only received ${ctx.stack.length} values`];
    const b = ctx.stack.pop();
    const a = ctx.stack.pop();

    // Return result of type-check
    const numberType = new types.UnionType(null, [
        types.PrimitiveType.Types.I32,
        types.PrimitiveType.Types.I64,
        types.PrimitiveType.Types.F32,
        types.PrimitiveType.Types.F64,
    ]);
    const ret = [value.ValueType.Data].includes(a.type) && [value.ValueType.Data].includes(b.type)
        && numberType.check(b.datatype) && numberType.check(a.datatype)
        && a.value.type === b.value.type;
    ctx.stack.push(toBool(ret, token));
}));

const funs = {
    '+' : new value.Value(null, value.ValueType.Fxn, new Fun(
        null,
        numberCheck,
        new value.Value(null, value.ValueType.Macro, new Macro((ctx, token) => {
            const b = ctx.stack.pop();
            const a = ctx.stack.pop();
            ctx.stack.push(new value.NumberValue(token, a.value.clone().add(b.value)));
        })),
    )),
    '*' : new value.Value(null, value.ValueType.Fxn, new Fun(
        null,
        numberCheck,
        new value.Value(null, value.ValueType.Macro, new Macro((ctx, token) => {
            const b = ctx.stack.pop();
            const a = ctx.stack.pop();
            ctx.stack.push(new value.NumberValue(token, a.value.clone().mul(b.value)));
        })),
    )),
    '%' : new value.Value(null, value.ValueType.Fxn, new Fun(
        null,
        numberCheck,
        new value.Value(null, value.ValueType.Macro, new Macro((ctx, token) => {
            const b = ctx.stack.pop();
            const a = ctx.stack.pop();
            ctx.stack.push(new value.NumberValue(token, a.value.clone().mod(b.value)));
        })),
    )),
    '-' : new value.Value(null, value.ValueType.Fxn, new Fun(
        null,
        numberCheck,
        new value.Value(null, value.ValueType.Macro, new Macro((ctx, token) => {
            const b = ctx.stack.pop();
            const a = ctx.stack.pop();
            ctx.stack.push(new value.NumberValue(token, a.value.clone().sub(b.value)));
        })),
    )),
    '/' : new value.Value(null, value.ValueType.Fxn, new Fun(
        null,
        numberCheck,
        new value.Value(null, value.ValueType.Macro, new Macro((ctx, token) => {
            const b = ctx.stack.pop();
            const a = ctx.stack.pop();
            ctx.stack.push(new value.NumberValue(token, a.value.clone().div(b.value)));
        })),
    )),

    // Default ==
    '==' : new value.Value(null, value.ValueType.Fxn, new Fun(
        null,
        new value.Value(null, value.ValueType.Macro, new Macro((ctx, token) => {
            // Pull args
            if (ctx.stack.length < 2)
                return ['expected two expressions to compare'];
            const b = ctx.stack.pop();
            const a = ctx.stack.pop();
            if (a.type !== b.type)
                return ['disparate types'];
            ctx.stack.push(toBool(true, token));
        })),
        new value.Value(null, value.ValueType.Macro, new Macro((ctx, token) => {
            // Pull args
            if (ctx.stack.length < 2)
                return ['expected two expressions to compare'];
            const b = ctx.stack.pop();
            const a = ctx.stack.pop();
            if (a.type !== b.type)
                return ['disparate types'];

            // Handle
            switch (a.type) {
                // Typechecking
                case value.ValueType.Type:
                    ctx.stack.push(toBool(b.value.check(a.value)));
                    break;

                // Value comparison
                case value.ValueType.Data:
                    // Cannot compare incompatible datatypes
                    if (!b.datatype.check(a.datatype))
                        return ['incompatible types'];

                    // Check all values for equality
                    // TODO avoid recursive solution
                    const ret = (function eq(a, b) {
                        // Recursively iterate through tuple members
                        if (a instanceof value.TupleValue) {
                            for (let i = 0; i < a.value.length; i++)
                                if (!eq(a.value[i], b.value[i]))
                                    return false;
                            return true;
                        }

                        // Compare wasm number values (if available at compile time)
                        if (a instanceof value.NumberValue)
                            return a.value.equals(b.value);

                        return 'wtf';
                    })(a, b);

                    // Pust result
                    if (typeof ret === 'string')
                        return ['WTF: unknown datatype'];
                    ctx.stack.push(toBool(ret));
                    break;

                // TODO expr

                // Invalid syntax type passed
                default:
                    return ['syntax error'];
            }
        })),
    )),
};

// Export map of macros
module.exports = Object.entries(operators).reduce((ret, [k, v]) =>
    ({
        ...ret,
        [k] : new value.Value(
            {},
            value.ValueType.Macro,
            new Macro(v.action)),
    }), {});

// Add some other values as well
module.exports = {
    ...module.exports,
    ...funs,
};