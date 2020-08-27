
// TODO optimize, use regex, etc.

// Enums
let TokenType = {
    String: 0,
    Number: 1,
    ContainerOpen: 2,
    ContainerClose: 3, 
    Identifier: 4,
    Block: 5,
};

// Internal
let ContainerType = {
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
    } else if (!isNaN(Number(token))) {
        return {
            token, 
            type: TokenType.Number,
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

    // Word
    } else {
        return {
            token,
            type: TokenType.Identifier,
            // TODO should be more prefixes probably
            subtype: token[0] === '$' ? 'escaped' 
                : token.match(/[A-Z].*/) ? 'upper'
                : token.match(/[a-z].*/) ? 'lower'
                : 'symbolic',
            ...options,
        };
    }
}


/**
 * Generates a list of tokens from given program source 
 * 
 * @param {string} src - program source code
 * @returns {LexerToken[]} - List of tokens
 */
function lex(src) {
    let i = 0, prev = 0;
    const ret = [];

    // Add token to return
    const addToken = s => ret.push(toToken(s, { position: i }));

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
        if (['[', ']', '{', '}', '(', ')'].includes(src[i])) {
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

    // Return list of token objects
    return ret.filter(s => s);
}

// Export
module.exports = { lex, TokenType, toToken };