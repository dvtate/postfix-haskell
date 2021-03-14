
// This handles Context-free grammars

// TODO optimize, use regex, etc.
// TODO chars

const { WasmNumber } = require("./numbers");

// Enums
const TokenType = {
    String: 0,
    Number: 1,
    ContainerOpen: 2,
    ContainerClose: 3,
    Identifier: 4,
    Block: 5,
};

// Internal
const ContainerType = {
    Curly: 0,
    Bracket: 1,
    Paren: 2,
};

/**
 * Describes tokenized string
 *
 * @param {string} token - lexical token string
 * @param {Object} options - override/extend defaults
 *
 * @returns {LexerToken}
 */
function toToken(token, options) {
    // Trim whitespace
    token = token.trim();

    // Filter empty tokens
    if (token.length === 0)
        return null;

    // String
    if (token[0] === '"') {
        return {
            token,
            type: TokenType.String,
            ...options,
        };

    // Number (note this makes NaN an identifier)
    } else if (!isNaN(parseFloat(token))) {
        return {
            token,
            type: TokenType.Number,
            value: new WasmNumber().fromString(token),
            ...options,
        };

    // Separators
    } else if ('{}[]()'.includes(token)) {
        return {
            token,
            type: '[{('.includes(token) ? TokenType.ContainerOpen : TokenType.ContainerClose,
            subtype: [
                ContainerType.Curly, ContainerType.Curly,
                ContainerType.Bracket, ContainerType.Bracket,
                ContainerType.Paren, ContainerType.Paren,
            ]['{}[]()'.indexOf(token)],
            ...options,
        }

    // Identifier
    } else {
        // Break namespaces
        return {
            token,
            type: TokenType.Identifier,
            ...options,
        };
    }
}

/**
 * Generates a list of tokens from given program source
 *
 * @param {string} src - program source code
 * @param {string} file - file name/path
 * @returns {LexerToken[]} - List of tokens
 */
function lex(src, file) {
    let i = 0, prev = 0;
    const ret = [];

    // Add token to return
    const addToken = s => ret.push(toToken(s, { position: i, file }));

    // Find end of string
    const endStr = () => {
        // Determine if quote is escaped
        function isEscaped(s, i) {
            let e = false;
            while (s[--i] === '\\')
                e = !e;
            return e;
        }

        // Find end of string
        while (++i < src.length)
            if (src[i] === '"' && !isEscaped(src, i))
                break;
    };

    // For each char...
    while (i < src.length) {
        // Separator
        if ('[]{}()'.includes(src[i])) {
            addToken(src.substring(prev, i));
            addToken(src[i]);

        // Line-Comment
        } else if (src[i] === '#') {
            addToken(src.substring(prev, i));
            while (i < src.length && src[i] !== '\n')
                i++;

        // End of token
        } else if ([' ', '\t', '\n'].includes(src[i])) {
            addToken(src.substring(prev, i));

        // String literal
        } else if (['"', "'"].includes(src[i])) {
            addToken(src.substring(prev, i));
            prev = i;
            endStr();
            i++;
            addToken(src.substring(prev, i));

        // Middle of a token
        } else {
            i++;
            continue;
        }

        // Next character in token
        prev = ++i;
    }

    // EOF is a separator
    if (i !== prev)
        addToken(src.substring(prev, i));

    // Return list of token objects
    return ret.filter(s => s);
}



/**
 * Throw syntax error
 *
 * @param {string} message - reason for error
 * @param {LexerToken[]} tokens - problematic tokens
 * @param {string} file - file name/path
 */
function throwParseError(message, tokens, file) {
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
 * @param {string} code - code to scan
 * @param {strng} file - file name/path
 * @returns {ParseTree}
 */
function parse(code, file) {

    const tokens = lex(code, file);
    let ret = [];

    // Parse tokens
    tokens.forEach(tok => {
        switch (tok.type) {
            // Collapse containers
            case TokenType.ContainerClose:
                // Index of most recent container
                // TODO use .reverse+findIndex?
                let ind;
                for (ind = ret.length - 1; ind >= 0; ind--)
                    if (ret[ind].type === TokenType.ContainerOpen)
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
                ret[ind].type = TokenType.Block;
                break;

            // Handle basic tokens
            default:
                ret.push(tok);
                break;
        }
    });
    return ret;
}

// Exports
module.exports = parse;
module.exports.parse = parse; // TODO update api
module.exports.TokenType = TokenType;

// only used for testing
module.exports.lex = lex;