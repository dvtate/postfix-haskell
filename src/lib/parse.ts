import { BlockToken, IdToken, LexerToken, MacroToken, NumberToken } from "./scan";
import * as value from './value';
import Context from './context';
import { LiteralMacro } from './macro';
import * as error from './error';
import * as types from './datatypes';

/*
The name for this file is somewhat misleading but technically correct

Because lang is postfix, just having a lexer is enough to create AST, however
For this language user interacts with this module through operators in order to
make a somewhat different expression tree
*/

// Debugging tools used to analyze and optimize compile-time
export const runtimeCache: [string, number][] = [];
export function generatePerfSummary(){
    const times: { [k: string]: number } = {};
    runtimeCache.sort(([, ta], [, tb]) => tb - ta);
    runtimeCache.forEach(([t, v]) => {
        if (times[t])
            times[t] += v;
        else
            times[t] = v;
    });

    return {
        times: runtimeCache.splice(0),
        uniqueTimes: times,
    };
}

/**
 * Create parse tree
 *
 * @param tokens - tokens to parse
 * @param ctx - parse ctx
 */
export default function parse(tokens: LexerToken[], ctx = new Context(tokens[0].file)): Context | error.SyntaxError {
    // For each token
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        switch (t.type) {
            // Identifiers: references to values
            case LexerToken.Type.Identifier:
                // Handle subtypes
                if ((t as IdToken).isEscaped) {
                    // Escaped symbol
                    ctx.push(new value.IdValue(t as IdToken));
                } else {
                    // Invoke operator
                    // const s = performance.now();
                    const v = ctx.getId((t as IdToken).value);
                    if (!v)
                        return new error.SyntaxError(`${t.token} is undefined`, t, ctx);
                    // console.log('invoke', t.token, v);
                    const ret = ctx.invoke(v, t);
                    // runtimeCache.push([t.token, performance.now() - s]);
                    // TODO this returns null sometimes
                    if (!(ret instanceof Context))
                        return ret;
                }
                break;

            // Need to determine number type from literal
            case LexerToken.Type.Number:
                ctx.push(new value.NumberValue(t, (t as NumberToken).value));
                break;

            // Blocks: Need to form a closure with current scope
            case LexerToken.Type.Block: {
                // This shouldn't be needed
                if (!(t instanceof MacroToken))
                    throw new Error('wtf?');

                // Get input and output types
                const ts: types.TupleType[] = [];
                for (const tt of t.types) {
                    const rv = ctx.parseTuple(tt, true);
                    if (!(rv instanceof Context))
                        return rv;
                    const v = ctx.pop();
                    if (!(v.value instanceof types.TupleType))
                        return new error.SyntaxError('Macro inputs tuple should only contain types', tt, ctx);
                    ts.push(v.value);
                }

                // Push macro onto stack
                const m = new LiteralMacro(ctx, t)
                m.recursive = t.recursive;
                if (ts.length !== 0 && !m.recursive) {
                    const rv = m.applyType(ctx, ts[0], ts[1]);
                    if (rv instanceof types.ArrowType)
                        console.warn('inferred type: ', rv);
                    if (rv)
                        throw rv;
                }
                ctx.push(m);
                break;
            }

            // Tuples: Like a block but gets parsed immediately and not as smart
            case LexerToken.Type.Tuple: {
                const ret = ctx.parseTuple(t as BlockToken);
                if (!(ret instanceof Context))
                    return ret;
                break;
            }

            // Parse: strings
            case LexerToken.Type.String:
                ctx.push(new value.StrValue(t));
                break;
        }
    }
    return ctx;
}