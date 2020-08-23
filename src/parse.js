

const lex = require('./lex');


/*
interface ParseNode {
    body?: ParseTree[],
    token: LexerToken,
}
*/

/**
 * Convert token to a Parser Node
 * @param {LexerToken} token 
 */
function convertToToken(token) {
}

/**
 * Generates a parse tree from list of tokens
 * 
 * @param {LexerToken} tokens
 * @returns {ParseTree}
 */
function parse(tokens) {
    let ret = [];

    tokens.forEach((tok, i) => {
        switch (tok.type) {
            // Parse Identifier
            case lex.TokenType.Identifier:
                switch(tok.subtype) {
                    // Operator
                    case 'symbolic':
                        ret.push({
                            ...token,
                            type: 'operator',
                        });
                    // Reference ($)
                    case 'escaped':

                    // Type
                    case 'upper':

                    // Function
                    case 'lower':
                } 
                break;
            case lex.TokenType.Literal:

        }
    });
}