const Macro = require('./macro');
const value = require('./value');
const error = require('./error');

/**
 * These are useful for interactive shell and maybe for compile-time debugging
 *
 * They will not be included in compiled output
 */


// This can be improved a lot...
async function logWithToken(name, ctx, token, fn) {
    console.log(`${name} - `, await fn(ctx, token));
}

// Get type name map
const syntaxTypes = Object.entries(value.ValueType)
    .reduce((acc, [k, v]) => ({ ...acc, [v] : k, }), {});

// Some operators for compile time debugging
const debugOperators = {
    // Syntactic type for given value
    ':type' : (ctx, token) => {

        // Return debug object with relevant info
        const v = ctx.pop();
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
    ':inspect' : (ctx, token) => ctx.pop(),
    ':data' : (ctx, token) => {
        const depict = v =>
            v.type === value.ValueType.Data
                ? v instanceof value.TupleValue
                    ? v.value.map(depict)
                    : v instanceof value.NumberValue
                        ? v.value.value
                        : 'unknown'
                : v.value;
        return depict(ctx.pop());
    },

    // View entire stack
    ':stack' : (ctx, token) => ctx.stack,
    ':stacklen' : ctx => ctx.stack.length,

    // Prevent compile if value is false
    ':assert' : (ctx, token) => {
        const v = ctx.pop();
        if (!(v instanceof value.NumberValue) || !v.value.value)
            throw new error.SyntaxError('Assertion failed', token);
        return 'pass';
    },

    ':targets' : ctx => ctx.exports,
    ':compile' : ctx => ctx.outWast(),

    ':wast' : ctx => ctx.outWast({ folding: true }),
    ':wat' : ctx => ctx.outWast({ folding: false }),
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
