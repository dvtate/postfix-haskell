import { CompilerMacro } from "./macro.js";
import * as value from "./value.js";
import * as error from "./error.js";
import Context from "./context.js";
import { LexerToken } from "./scan.js";
import { fileLocate, formatErrorPos } from "../tools/file_tools.js";
import path from "path";
import { EnumValue } from "./enum.js";

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
    // Generate file name prefix if token has a file location
    const absPath = token.file || ctx.entryPoint;
    let prefix = '';
    if (absPath) {
        const loc = fileLocate(absPath, token.position);
        const relPath = path.relative(process.cwd(), absPath);
        const file = relPath.length < absPath.length ? relPath : absPath;
        prefix = `${file}:${loc.lineNumber}:${loc.lineOffset} -`;
    }
    prefix = `\x1B[1m${prefix} ${name} \x1B[0m`;

    // This can be improved
    try {
        // Get something to represent
        const repr = fn(ctx, token);

        // Notice that promises are only used for :compile so this is acceptable
        if (repr instanceof Promise)
            repr.then(v => console.log(prefix, v)).catch(console.error);
        else
            console.log(prefix, repr, '\n');
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
const debugOperators: { [k: string]: (ctx: Context, token: LexerToken) => any } = {
    // Syntactic type for given value
    ':type' : (ctx: Context) => {
        // Return debug object with relevant info
        const v = ctx.pop();
        if (v.datatype)
            return v.datatype.toString();
        return { syntaxType: syntaxTypes[v.type] };
    },

    // Debug js stack trace
    ':ctrace' : () => new Error('').stack,

    // Debug context
    ':module' : ctx => ctx.module,
    ':scopes' : ctx => ctx.scopes,
    ':globals' : ctx => ctx.globals,
    ':context' : ctx => ctx,

    // View last item on stack
    ':inspect' : ctx => ctx.pop(),
    ':data' : ctx => {
        const depict = (v: value.Value): string =>
            v.type === value.ValueType.Data
                ? v instanceof value.TupleValue
                    ? `( ${v.value.map(depict).join(' ')} )`
                    : v instanceof value.NumberValue
                        ? `\x1b[33m${v.value.toString()}\x1b[0m`
                        : v instanceof EnumValue
                            ? `${depict(v.value)} ${v.enumClass.parent.name || '?'}.${v.enumClass.name} make`
                            : 'unknown'
                : v.type === value.ValueType.Type
                    ? v.value.toString()
                    : v.type === value.ValueType.Str
                        ? `\x1b[33m"${v.value}"\x1b[0m`
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
    ':stack' : ctx => ctx.stack,
    ':stack_types' : ctx => ctx.stack.map(v => 
        v.datatype ? v.datatype.toString() : { syntaxType: syntaxTypes[v.type] }),
    ':stacklen' : ctx => ctx.stack.length,

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
    ':targets' : ctx => ctx.module.definitions,
    ':compile' : async ctx => await ctx.outWast({ optimize: true }),
    ':wast' : async ctx => await ctx.outWast({ folding: true }),
    ':wat' : async ctx => await ctx.outWast({ folding: false }),
};

// Export Macros because user shouldn't override
export default Object.entries(debugOperators).reduce((acc, [k, v]) => ({
    ...acc,
    [k] : new CompilerMacro(null, (ctx, token) => logWithToken(k, ctx, token, v), k),
}), {});
