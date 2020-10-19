const value = require('./value');
const lex = require('./scan');
const { WasmNumber, NumberType } = require('./numbers');
const Context = require('./context');
const Macro = require('./macro');

/*
The name for this file is somewhat misleading but technically correct

Because lang is postfix, just having a lexer is enough to create AST, however
For this language user interacts with this module through operators in order to
make a somewhat different expression tree
*/

class ParseError extends Error {
    constructor(msg, token, ctx) {
        super();
        this.trace = [token];
        this.message = msg;
        this.ctx = ctx;
    }
}

/**
 * Create parse tree
 *
 * @param {LexerToken.token} tokens - tokens to parse
 * @param {Context} ctx - parse ctx
 */
function parse(tokens, ctx, scopes) {
    scopes = scopes || ctx.scopes;

    // Note: This is the context of the parser, the language itself is stateless
    ctx = ctx || new Context();

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        switch (t.type) {

            // Need to determine number type from literal
            case lex.TokenType.Number:
                ctx.stack.push(new value.NumberValue(t, t.value));
                break;

            // Blocks: Need to form a closure with current scope
            case lex.TokenType.Block:
                ctx.stack.push(new value.Value(value.ValueType.Macro, new Macro(parse.bind(null, t.body), ctx, t.body), t));
                // ctx.stack.push(new Value(ValueType.Macro, { body: t.body, scope: ctx.scopes.slice() }, t));
                break;

            // Identifiers: also need to bind scope
            case lex.TokenType.Identifier:
                // Handle subtypes
                if (t.subtype == 'escaped') {
                    // Escaped symbol, basically a literal
                    ctx.stack.push(new value.IdValue(token, { id: t.token, scope: ctx.scopes.slice() }));
                } else if (t.subtype == 'upper') {
                    // TypeName
                    ctx.stack.push(new value.Value(value.ValueType.TypeName, { id: t.token, scope: ctx.scopes.slice() }, t));
                } else {
                    // Invoke operator
                    const v = ctx.getId(t.token);
                    if (!v)
                        return new ParseError(`${t.token} is undefined`, t, ctx);

                    // console.log('invoke', v);
                    if (v.type === value.ValueType.Macro) {
                        // Invoke macro
                        const ret = v.value.action(ctx, token);
                        if (ret instanceof Array)
                            return new ParseError(ret.map(e => `${t.token}: ${e}`).join('; '), t, ctx);
                    } else {
                        // Just put it on stack
                        ctx.stack.push(v);
                    }
                }
                break;
        }
    }

    return ctx;
}

module.exports = parse;
module.exports.ParseError = ParseError;