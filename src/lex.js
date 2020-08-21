
// Enum
let TokenType = {
    Literal : 0, Separator : 1, Symbol : 2, Identifier : 3, 
};

/*
Interface

*/


/**
 * Describes tokenized string
 * 
 * @param {string} token - 
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
            type: TokenType.Symbol,
            subtype: 'string',
            ...options,
        };

    // Number (note this makes NaN an identifier)
    } else if (!isNaN(Number(token))) {
        return {
            token, 
            type: TokenType.Literal,
            subtype: 'number',
            ...options,
        };

    // Identifier
    } else {
        return {
            token,
            type: TokenType.Identifier,
            subtype: token[0] === '$' ? 'escaped' 
                : token.match(/[A-z].*/) ? 'upper'
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
 * @returns {Token[]} - List of tokens
 */
function lex(src) {
    
    // TODO optimize, use regex, etc.
    const ret = [];
    let i = 0, prev = 0;
    
    while (i < src.length) {

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

        // Reached end of symbol
        if ([' ', '\t', '\n'].includes(src[i])) {
            // Push token
            if (prev !== i) 
                ret.push(toToken(src.substring(prev, i)));
            
            // Find start of next token
            while ([' ', '\t', '\n'].includes(src[i]) && i < src.length)
                i++;
            
        // Line comment
        } else if (src[i] === '#') {
            // Push token
            if (prev !== i)
                ret.push(toToken(src.substring(prev, i)));

            // Find start of next token
            while (i < src.length && src[i] !== '\n')
                i++;
            i++;

        // String literal
        } else if (src[i] === '"') {

            // Push string literal
            endStr();
            i++;
            ret.push(toToken(src.substring(prev, i)));

        } else {
            // Probably part of a symbol... keep chugging
            i++;
            continue;
        }

        // Start of a new token
        prev = i;
    }

    return ret.filter(t => t);
}

// Export
module.exports = { lex, TokenType, toToken };