import { CompilerMacro } from "./macro";
import * as value from "./value";
import * as error from "./error";
import { Context } from "vm";
import { LexerToken } from "./scan";
import { formatErrorPos } from "../tools/util";

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
    // This can be improved
    try {
        // Get something to represent
        const repr = fn(ctx, token);

        // Notice that promises are only used for :compile so this is acceptable
        if (repr instanceof Promise)
            repr.then(v => console.log(name, '-', v)).catch(console.error);
        else
            console.log(name, '-', repr);
    } catch (e) {
        // Internal vs external error
        if (e instanceof error.CompilerError)
            return e;
        else
            throw e;
    }
}

// Get type name map
const syntaxTypes: {[k: number] : string} =
    Object.entries(value.ValueType)
        .reduce((acc, [k, v]) => ({ ...acc, [v] : k, }), {});

// Some operators for compile time debugging
const debugOperators = {
    // Syntactic type for given value
    ':type' : (ctx: Context) => {

        // Return debug object with relevant info
        const v = ctx.pop();
        const ret: any = { syntaxType: syntaxTypes[v.type] };
        if (v.datatype)
            ret.datatype = v.datatype;
        return ret;
    },

    // Debug js stack trace
    ':ctrace' : (ctx: Context) => new Error('').stack,

    // Debug context
    ':module' : (ctx: Context) => ctx.module,
    ':scopes' : (ctx: Context) => ctx.scopes,
    ':globals' : (ctx: Context) => ctx.globals,
    ':context' : (ctx: Context) => ctx,

    // View last item on stack
    ':inspect' : (ctx: Context) => ctx.pop(),
    ':data' : (ctx: Context) => {
        const depict = (v: value.Value): string =>
            v.type === value.ValueType.Data
                ? v instanceof value.TupleValue
                    ? v.value.map(depict)
                    : v instanceof value.NumberValue
                        ? v.value.value
                        : 'unknown'
                : v.value || v;
        return depict(ctx.pop());
    },

    // Run arbitrary js code
    ':eval' : (ctx: Context, token: LexerToken) => {
        const str = ctx.pop();
        if (!(str instanceof value.StrValue))
            throw new error.SyntaxError(':eval expected a string containing js code', token, ctx);
        return eval(str.value);
    },

    // View entire stack
    ':stack' : (ctx: Context) => ctx.stack,
    ':stacklen' : (ctx: Context) => ctx.stack.length,

    // Prevent compile if value is false
    ':assert' : (ctx: Context, token: LexerToken) => {
        const v = ctx.pop();
        if (!(v instanceof value.NumberValue) || !v.value.value)
            throw new error.SyntaxError('Assertion failed', token, ctx);
        return 'pass';
    },

    // Prevent compilation
    ':error' : (ctx: Context, token: LexerToken) => {
        const msg = ctx.pop();
        if (!(msg instanceof value.StrValue))
            throw new error.SyntaxError(':error expected a string message', token, ctx);
        throw new error.SyntaxError(`:error - ${msg.value}`, token, ctx);
    },

    // Debug the semantics stack trace
    ':locate' : (ctx: Context, token: LexerToken) => {
        const v = ctx.pop();
        return formatErrorPos([{ name: token.token, message: token.token, tokens: [v.token] }]);
    },

    // Compilation and stuff
    ':targets' : (ctx: Context) => ctx.exports,
    ':compile' : async (ctx: Context) => await ctx.outWast({}),
    ':wast' : async (ctx: Context) => await ctx.outWast({ folding: true }),
    ':wat' : async (ctx: Context) => await ctx.outWast({ folding: false }),
};

// Export Macros because user shouldn't override
export default Object.entries(debugOperators).reduce((acc, [k, v]) => ({
    ...acc,
    [k] : new CompilerMacro(null, (ctx, token) => logWithToken(k, ctx, token, v), k),
}), {});
