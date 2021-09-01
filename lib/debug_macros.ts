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
const syntaxTypes: {[k: number] : string} =
    Object.entries(value.ValueType)
        .reduce((acc, [k, v]) => ({ ...acc, [v] : k, }), {});

// Some operators for compile time debugging
const debugOperators = {
    // Syntactic type for given value
    ':type' : (ctx: Context, token: LexerToken) => {

        // Return debug object with relevant info
        const v = ctx.pop();
        const ret: any = { syntaxType: syntaxTypes[v.type] };
        if (v.datatype)
            ret.datatype = v.datatype;
        return ret;
    },

    ':ctrace' : (ctx: Context, token: LexerToken) => new Error('').stack,

    // Debug context
    ':module' : (ctx: Context, token: LexerToken) => ctx.module,
    ':scopes' : (ctx: Context, token: LexerToken) => ctx.scopes,
    ':globals' : (ctx: Context, token: LexerToken) => ctx.globals,
    ':context' : (ctx: Context, token: LexerToken) => ctx,

    // View last item on stack
    ':inspect' : (ctx: Context, token: LexerToken) => ctx.pop(),
    ':data' : (ctx: Context, token: LexerToken) => {
        const depict = (v: value.Value): string =>
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
    ':stack' : (ctx: Context, token: LexerToken) => ctx.stack,
    ':stacklen' : (ctx: Context, token: LexerToken) => ctx.stack.length,

    // Prevent compile if value is false
    ':assert' : (ctx: Context, token: LexerToken) => {
        const v = ctx.pop();
        if (!(v instanceof value.NumberValue) || !v.value.value)
            throw new error.SyntaxError('Assertion failed', token);
        return 'pass';
    },

    ':targets' : (ctx: Context, token: LexerToken) => ctx.exports,
    ':compile' : async (ctx: Context, token: LexerToken) => await ctx.outWast({}),

    ':wast' : async (ctx: Context, token: LexerToken) => await ctx.outWast({ folding: true }),
    ':wat' : async (ctx: Context, token: LexerToken) => await ctx.outWast({ folding: false }),
};

// Export Macros because user shouldn't override
export default Object.entries(debugOperators).reduce((acc, [k, v]) => ({
    ...acc,
    [k] : new value.MacroValue(
        undefined,
        new CompilerMacro((ctx, token) => logWithToken(k, ctx, token, v))),
}), {});
