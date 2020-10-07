const { ValueType, Value } = require('./value');
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
        this.trace = [token];
        this.message = msg;
        this.ctx = ctx;
    }
}

/**
 * Create parse tree
 *
 * @param {LexerToken.token} tokens - tokens to parse
 * @param {Context} state - parse state
 */
function parse(tokens, state) {

    // Note: This is the state of the parser, the language itself is stateless
    state = state || new Context();

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        switch (t.type) {

            // Need to determine number type from literal
            case lex.TokenType.Number:
                // Get size
                let isLong = false;
                const s = t.token;
                if ('Ll'.includes(t.token[t.token.length - 1])) {
                    t.token = s.slice(0, -1);
                    isLong = true;
                }

                // Get type
                let isInt = true;
                let n;
                try {
                    n = BigInt(s);
                } catch (_) {
                    isInt = false;
                    n = Number(s);
                }

                // Push to stack
                const numType = isInt
                    ? (isLong ? NumberType.I64 : NumberType.I32)
                    : (isLong ? NumberType.F64 : NumberType.F32);
                state.stack.push(new Value(ValueType.Number, new WasmNumber(numType, n), t));

                break;

            // Blocks: Need to form a closure with current scope
            case lex.TokenType.Block:
                state.stack.push(new Value(ValueType.Macro, new Macro(state, parse.bind(null, t.body), t.body), t));
                // state.stack.push(new Value(ValueType.Macro, { body: t.body, scope: state.scopes.slice() }, t));
                break;

            // Identifiers: also need to bind scope
            case lex.TokenType.Identifier:
                // Handle subtypes
                if (t.subtype == 'escaped') {
                    // Escaped symbol, basically a literal
                    state.stack.push(new Value(ValueType.Id, { id: t.token, scope: state.scopes.slice() }, ));
                } else if (t.subtype == 'upper') {
                    // TypeName
                    state.stack.push(new Value(ValueType.TypeName, { id: t.token, scope: state.scopes.slice() }, t));
                } else {
                    // Invoke operator
                    const v = state.getId(t.token);
                    // console.log('exec', v);
                    if (v.type === ValueType.Macro) {
                        // Invoke macro
                        const ret = v.value.action(state);
                        if (ret instanceof Array) {
                            return new ParseError(ret.map(e => `${t.token}: ${e}`).join('; '), t, state);
                        }
                    } else {
                        //
                    }
                }
                break;
        }
    }

    return state;
}

module.exports = parse;