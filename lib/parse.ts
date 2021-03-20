import { BlockToken, LexerToken, NumberToken } from "./scan";

import * as value from './value';
import Context from './context';
import Macro from './macro';
import * as error from './error';

/*
The name for this file is somewhat misleading but technically correct

Because lang is postfix, just having a lexer is enough to create AST, however
For this language user interacts with this module through operators in order to
make a somewhat different expression tree
*/

/**
 * Create parse tree
 *
 * @param {LexerToken.token} tokens - tokens to parse
 * @param {Context} ctx - parse ctx
 */
export default function parse(tokens: LexerToken[], ctx = new Context()): Context | error.SyntaxError {
    // For each token
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        switch (t.type) {
            // Need to determine number type from literal
            case LexerToken.Type.Number:
                ctx.push(new value.NumberValue(t, (t as NumberToken).value));
                break;

            // Blocks: Need to form a closure with current scope
            case LexerToken.Type.Block:
                ctx.push(new value.Value(t, value.ValueType.Macro, Macro.fromLiteral(ctx, t as BlockToken, parse)));
                break;

            // Identifiers: also need to bind scope
            case LexerToken.Type.Identifier:
                // Handle subtypes
                if (t.token[0] === '$') {
                    // Escaped symbol
                    ctx.push(new value.IdValue(t, t.token, ctx.scopes.slice()));
                } else {
                    // Invoke operator
                    let v = ctx.getId(t.token);
                    if (!v)
                        return new error.SyntaxError(`${t.token} is undefined`, t, ctx);
                    // console.log('invoke', t.token, v);
                    const ret = ctx.invoke(v, t);
                    if (!(ret instanceof Context))
                        return ret;
                }
                break;
        }
    }
    return ctx;
};