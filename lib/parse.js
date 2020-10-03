const { ValueType } = require('./value');
const lex = require('./scan');
const { stat } = require('fs');
const { WasmNumber, NumberType } = require('./number');

/*
The name for this file is somewhat misleading but technically correct

Because lang is postfix, just having a lexer is enough to create AST, however
For this language user interacts with this module through operators in order to
make a somewhat different expression tree
*/

/**
 * Look up identifier
 *
 * @param {LexerToken} id -
 * @param {ParserState} state -
 * @returns {undefined|Value} - returns value if found
 */
function getId(id, state) {
    // Check scoped variables
    id = id.token.token;
    const unescaped = id[0] == '$' ? id.slice(1) : id;
    const scopes = unescaped.split('.');

    // Follow nested scopes
    let ret = state.scope;
    for (const s of scopes)
        ret = ret[s];

    // Globals
    if (!ret) {
        return state.globals[id];
    }

    return ret;
}

/**
 * Create parse tree
 *
 * @param {LexerToken.token} tokens
 */
async function parse(tokens) {

    // Note: This is the state of the parser, the language itself is stateless
    let state = {
        stack: [],
        module: {},
        scope: {},
        globals: { ...require('./ppcs'), },
    };

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
                t.scope = state.scope;
                state.stack.push(t);
                break;

            // Identifiers: also need to bind scope
            case lex.TokenType.Identifier:
                t.scope = state.scope;

                // Handle subtypes
                if (t.subtype == 'escaped') {
                    // Escaped symbol, basically a literal
                    state.stack.push({

                    });
                } else if (t.subtype == 'upper') {
                    // Extract type
                    const v = { type: ValueType.TypeName}
                    t.scope = state.scope;
                    state.stack.push(state.scope)
                } else {
                    //
                }

                break;
        }
    }

    return state;
}