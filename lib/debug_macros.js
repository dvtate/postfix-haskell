const Macro = require('./macro');
const value = require('./value');

/**
 * These are useful for interactive shell and maybe for compile-time debugging
 *
 * They will not be included in compiled output
 */


// This can be replaced
function logWithToken(name, ctx, token, fn) {
    console.log(`${name} - `, fn(ctx, token));
}

// Some operators for compile time debugging
const debugOperators = {
    // Syntactic type for given value
    ':type' : (ctx, token) => {
        // Get type name map
        const syntaxTypes = Object.entries(value.ValueType).reduce((acc, [k, v]) => ({ ...acc, [v] : k, }), {});

        // Return debug object with relevant info
        const v = ctx.stack.pop();
        const ret = { syntaxType: syntaxTypes[v.type] };
        if (v.type === value.ValueType.Data)
            ret.datatype = v.datatype;
        return ret;
    },

    // Debug context
    ':module' : (ctx, token) => ctx.module,
    ':scopes' : (ctx, token) => ctx.scopes,
    ':globals' : (ctx, token) => ctx.globals,
    ':context' : (ctx, token) => ctx,

    // View last item on stack
    ':inspect' : (ctx, token) => ctx.stack.pop(),

    // View entire stack
    ':stack' : (ctx, token) => ctx.stack.splice(0, ctx.stack.length),
};

// Export Macros because user shouldn't override
module.exports = Object.entries(debugOperators).reduce((acc, [k, v]) => ({
    ...acc,
    [k] : new value.Value(
        {},
        value.ValueType.Macro,
        new Macro((ctx, token) => {
            logWithToken(k, ctx, token, v);
        })),
}), {});