const { ValueType, Value } = require('./value');
const Macro = require('./macro');

/*
These are globally defined macros

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
            if (sym.type !== ValueType.Id) {
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
        action: ctx => {
            // Check stack
            if (ctx.stack.length < 2)
                return ['expected two values'];

            // Check types
            const b = ctx.stack.pop().deref(ctx);
            const a = ctx.stack.pop().deref(ctx);
            if (![ValueType.Number].includes(a.type))
                return ['first value is wrong type'];
            if (![ValueType.Number].includes(b.type))
                return ['second value is wrong type'];
            if (a.type !== b.type)
                return ['incompatible types'];

            //
            switch (a.type) {
                // + on numbers (add)
                case ValueType.Number:
                    ctx.stack.push(a.value.add(b.value));
                    return;
            }
        },
    },
};

// Export map of values
module.exports = Object.entries(operators).reduce((ret, [k, v]) =>
    ({ ...ret,  [k] : new Value(ValueType.Macro, new Macro(v.action)) }), {});
