
const lex = require('./scan');

/**
 *
 * @param {LexerToken} id
 * @param {ParserState} state
 */
async function handleId(id, state) {

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
    };

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        switch (t.type) {
            // Literals: just push onto stack
            case lex.TokenType.String:
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
                    state.stack.push(t);
                } else if (t.subtype == 'upper') {
                    // Extract type
                    t.token.split('.');
                    state.stack.push(state.scope)
                } else {
                    //
                }
        }
    }
}