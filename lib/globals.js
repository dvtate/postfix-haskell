const value = require('./value');
const types = require('./datatypes');
const Macro = require('./macro');
const Context = require('./context');

/*
These are globally defined operators some may eventually be moved to standard library

This file will probably be broken into different ones later
*/

// TODO verify input length
// TODO Move some to standard library
// TODO simplify schema

// User can overload these but they will break everything lmao
const operators = {
    // Duplicate an item on the stack
    // TODO this should go in a standard library instead { $v = $v $v } $dup =
    'dup' : {
        action: ctx =>
            ctx.stack.length >= 1
                ? ctx.stack.push(ctx.stack[ctx.stack.length - 1])
                : ['Nothing to dup'],
    },

    // Drop an item from the stack
    // TODO this should go in standard library istead { $_ }
    'drop' : {
        action: ctx =>
            ctx.stack.length >= 1
                ? ctx.stack.pop()
                : ['Nothing to drop'],
    },

    // Addition
    '+' : {
        action: (ctx, token) => {
            // Check stack
            if (ctx.stack.length < 2)
                return ['expected two values'];

            // Check types
            const b = ctx.stack.pop();
            const a = ctx.stack.pop();
            const numberType = new types.UnionType(null, [
                types.PrimitiveType.Types.I32,
                types.PrimitiveType.Types.I64,
                types.PrimitiveType.Types.F32,
                types.PrimitiveType.Types.F64,
            ]);
            if (![value.ValueType.Data].includes(a.type))
                return ['first value is wrong type'];
            if (![value.ValueType.Data].includes(b.type))
                return ['second value is wrong type'];
            if (!numberType.check(b.datatype))
                return ['second value is wrong data type'];
            if (!numberType.check(a.datatype))
                return ['first value is wrong data type'];
            if (a.value.type !== b.value.type) // TODO implicit conversion
                return ['incompatible types'];

            // Push onto the stack
            ctx.stack.push(new value.NumberValue(token, a.value.clone().add(b.value)));
        },
    },

    // Everything above here should probably be moved to standard library

    // Bind identifier to expression
    '=' : {
        action: ctx => {
            // Typerror, pretend successfull
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
            if (rvs.some(v => v.type !== t0))
                return ['differing syntactic types passed to pack']; // TODO eventually this could be allowed

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
            let v = ctx.stack.pop();
            if (v.type === value.ValueType.Type)
                v = new value.Value(token, value.ValueType.Macro,
                    new Macro((ctx, token) => ctx.stack.push(v), ctx));

            // Assert macro type
            if (v.type !== value.ValueType.Macro)
                return ['expected a macro or type'];

            // Wrap macro with one that appends class type to return value
            const wrapper = (ctx, tok) => {
                // Invoke v
                const oldStack = ctx.stack.slice();
                const ev = v.value.action(ctx, token);
                console.log('ev:', ev);
                if (typeof ev === 'object' && !(ev instanceof Context))
                    return ev;

                // Assert that macro returns a single type
                const retlen = ctx.stack.length - ctx.cmpStack(oldStack);
                if (retlen > 1)
                    return ['type macro should only return one value']; // TODO need to find a way to improve error tracing
                const t = ctx.stack.pop();
                if (t.type !== value.ValueType.Type)
                    return ['expected a type to append class to'];

                // Use class wrapper
                const ret = new types.ClassType(token, t);
                ctx.stack.push(ret);
            };

            // Push
            ctx.stack.push(new value.Value(token, value.ValueType.Macro, new Macro(wrapper, ctx)));
        },
    },

    // Unpack a tuple
    'unpack' : {
        action: (ctx, token) => {
            const v = ctx.stack.pop();
            if (v.type === value.ValueType.Type) {
                if (!(v instanceof types.TupleType))
                    return ['expected a tuple to unpack'];

                // Push types onto the stack

            } else if (v.type === value.ValueType.Data) {
                if (!(v instanceof value.TupleValue))
                    return ['expected a tuple to unpack'];

                // Push values onto the stack

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
            v.datatype = t;
        },
    },

    // Get the datatype of a value
    'type' : {
        action: (ctx, token) => {
            const v = ctx.stack.pop();
            if (v.type !== value.ValueType.Data)
                return ['expected data'];
            ctx.stack.push(new value.Value(token, value.ValueType.Type, v.datatype));
        },
    },
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