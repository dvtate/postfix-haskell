

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
 * Throw syntax error
 * 
 * @param {string} message - reason for error
 * @param {lex.LexerToken[]} tokens - problematic tokens
 */
function throwParseError(message, tokens) {
    throw {
        type: 'SyntaxError',
        message,
        tokens,
        stack: new Error(),
    };
}

/**
 * Generates a parse tree from list of tokens
 * Really only benefit here is that this collapses containers
 * 
 * @param {lex.LexerToken} tokens
 * @returns {ParseTree}
 */
function parse(tokens) {

    let ret = [];

    // Parse tokens
    tokens.forEach((tok, i) => {
        switch (tok.type) {
            // Handle basic tokens
            case lex.TokenType.Identifier:
            case lex.TokenType.String:
            case lex.TokenType.Number:
            case lex.TokenType.ContainerOpen:
                ret.push(tok);
                break;

            // Collapse containers
            case lex.TokenType.ContainerClose: {
                // Index of most recent container
                let ind;
                for (ind = ret.length - 1; ind >= 0; ind--)
                    if (ret[ind].type === lex.TokenType.ContainerOpen)
                        break;
                
                // No openers
                if (ind === -1)
                    throwParseError('Unexpected symbol ' + tok.token, [tok]);
                
                // Not matching
                if (ret[ind].subtype !== tok.subtype)
                    throwParseError(`Container mismatch ${ret[ind].token} vs. ${tok.token}`, [ret[ind], tok]);
        
                // Collapse body
                // Note for now only containers are for 'Block'
                ret[ind].body = ret.splice(ind + 1);
                ret[ind].type = lex.TokenType.Block;
            };
            break;
        }
    });

    return ret;
}

module.exports = { parse, lex };