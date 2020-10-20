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


const debugOperators = {
    ':type' : (ctx, token) => {
        const syntaxTypes = Object.entries(value.ValueType).reduce((acc, [k, v]) => ({ ...acc, [v] : k, }), {});

        const v = ctx.stack.pop();
        const ret = { syntaxType: syntaxTypes[v.type] };
        if (v.type === value.ValueType.Data)
            ret.datatype = v.datatype;
        return ret;
    },
    ':module' : (ctx, token) => ctx.module,
    ':scopes' : (ctx, token) => ctx.scopes,
    ':globals' : (ctx, token) => ctx.globals,
};

module.exports = Object.entries(debugOperators).reduce((acc, [k, v]) => ({
    ...acc,
    [k] : new value.Value(
        {},
        value.ValueType.Macro,
        new Macro((ctx, token) => {
            logWithToken(k, ctx, token, v);
        })),
}), {});