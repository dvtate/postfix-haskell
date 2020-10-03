const { ValueType, Value } = require('./value');
const lex = require('./scan');
const { WasmNumber, NumberType } = require('./number');
const State = require('./state');

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
 * @param {State} state - parse state
 */
async function parse(tokens, state) {

    // Note: This is the state of the parser, the language itself is stateless
    const state = state || new State();

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        switch (t.type) {
            // Literals: just push onto stack
            case lex.TokenType.String:
                state.stack.push(t);
                break;
            case lex.TokenType.Number:
                state.stack.push(t);
                break;

            // Blocks: Need to form a closure with current scope
            case lex.TokenType.Block:
                state.stack.push(new Value(ValueType.Macro, { body: t.body, scope: state.scopes.slice() }, t));
                break;

            // Identifiers: also need to bind scope
            case lex.TokenType.Identifier:
                // Handle subtypes
                if (t.subtype == 'escaped') {
                    // Escaped symbol, basically a literal
                    state.stack.push(new Value(ValueType.Id, { id: t.token, scope: state.scopes.slice() }, ));
                } else if (t.subtype == 'upper') {
                    // TypeName
                    state.stack.push(new Value(ValueType.TypeName, { id: t.token, scope: state.scopes.slice() }, t))
                } else {
                    // Invoke operator
                    const v = state.getId(t.token);
                    if (v.type === ValueType.Macro) {
                        state.
                        parse(v.value.body, state);
                    }
                }
                break;
        }
    }

    return state;
}