const value = require('./value');
const types = require('./datatypes');
const Macro = require('./macro');
const { type } = require('os');

/*
These are globally defined operators some may eventually be moved to standard library

This file will probably be broken into different ones later

*/

//
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
            let { id } = sym.value;
            id = (id[0] == '$' ? id.slice(1) : id).split('.')[0];
            if (ctx.scopes[ctx.scopes.length - 1][id])
                return [`${id} is already defined in current scope`]; // TODO: show where it was defined

            // Set local
            const v = ctx.stack.pop();
            ctx.scopes[ctx.scopes.length - 1][id] = v;
        },
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
            const numberType = new types.Union([
                types.Primitive.Types.I32,
                types.Primitive.Types.I64,
                types.Primitive.Types.F32,
                types.Primitive.Types.F64,
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

    // Union type operator
    '|' : {
        action: (ctx, token) => {
            // Get input
            if (ctx.stack.length < 2)
                return ['expected 2 operands'];
            const b = ctx.stack.pop();
            const a = ctx.stack.pop();
            if (a.type != b.type)
                return ['invalid syntax'];
            if (a.type !== value.ValueType.Type)
                return ['left value should be a type'];

            // Create type union
            const ret = new types.UnionType(token, []);
            ret.types = (a instanceof types.UnionType ? a.types : [a])
                 .concat(b instanceof types.UnionType ? b.types : [b]);
            ctx.stack.push(ret);
        },
    },

    'pack' : {
        action: (ctx, token) => {
            // Get executable array
            const execArr = ctx.stack.pop();
            if (execArr.type !== value.ValueType.Macro)
                return ['expected a macro of values to pack'];

            // Get values from passed executable array
            const stackCpy = ctx.stack.slice();
            const ev = execArr.action(ctx, token);
            const rvs = ctx.stack.slice(ctx.cmpStack(stackCpy));
            if (rvs.length === 0)
                return ['pack expected at least one value to pack'];
            const t0 = rvs[0].type;
            if (rvs.some(v => v.type !== t0))
                return ['differing syntctic types passed to pack']; // TODO eventually this could be allowed

            // Make tuple
            const ret = t0 === value.ValueType.Data
                ? new value.TupleValue(token, rvs)
                : new types.TupleType(token, rvs);
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
                const ret = v.action(ctx, token);
                if (ret instanceof Array)
                    return ret;

                // Assert that macro returns a single type
                const retlen = ctx.stack.length - ctx.cmpStack(oldStack);
                if (retlen > 1)
                    return ['type macro should only return one value']; // TODO need to find a way to improve error tracing
                const t = ctx.stack.pop();
                if (t.type !== value.ValueType.Type)

                // Use class wrapper
                const t = ctx.stack.pop();
                const ret = new types.ClassType(token, t);
                ctx.stack.push(ret);
            };

            // Push
            ctx.stack.push(new value.Value(token, value.ValueType.Macro, new Macro(wrapper, ctx)));
        },
    },

    'make' : {
        action: (ctx, token) => {
            // TODO Check base type compatible ?
            // Apply type
            const t = ctx.stack.pop();
            const v = ctx.stack[ctx.stack.length - 1];
            v.datatype = t;
        },
    },

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

};

// Export map of values
module.exports = Object.entries(operators).reduce((ret, [k, v]) =>
    ({
        ...ret,
        [k] : new value.Value(
            {},
            value.ValueType.Macro,
            new Macro(v.action)),
    }), {});