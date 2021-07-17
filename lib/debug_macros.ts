import { CompilerMacro } from "./macro";
import * as value from "./value";
import * as error from "./error";
import { Context } from "vm";
import { LexerToken } from "./scan";

/*
 * These are useful for interactive shell and maybe for compile-time debugging
 *
 * They will not be included in compiled output
 */


/**
 * log output of macro
 * @param name
 * @param ctx
 * @param token
 * @param fn
 */
function logWithToken(name: string, ctx: Context, token: LexerToken, fn: (ctx: Context, token: LexerToken) => any) {
    // This can be improved a lot...
    const repr = fn(ctx, token);
    if (repr instanceof Promise)
        repr.then(v => console.log(name, '-', v)).catch(console.error);
    else
        console.log(name, '-', repr);

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
        const ret: any = { syntaxType: syntaxTypes[v.type] };
        if (v instanceof value.DataValue)
            ret.datatype = v.datatype;
        return ret;
    },

    ':ctrace' : (ctx, token) => new Error('').stack,

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
    ':compile' : async ctx => await ctx.outWast({}),

    ':wast' : async ctx => await ctx.outWast({ folding: true }),
    ':wat' : async ctx => await ctx.outWast({ folding: false }),
};

// Export Macros because user shouldn't override
export default Object.entries(debugOperators).reduce((acc, [k, v]) => ({
    ...acc,
    [k] : new value.MacroValue(
        undefined,
        new CompilerMacro((ctx, token) => logWithToken(k, ctx, token, v))),
}), {});
