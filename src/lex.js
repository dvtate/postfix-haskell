
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
            type: TokenType.Literal,
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

    // Separators
    } else if ('{}[]()'.includes(token)) {
        return {
            token, 
            type: TokenType.Separator,
            subtype: [
                'open-curly',
                'close-curly',
                'open-bracket',
                'close-bracket',
                'open-paren',
                'close-paren',
            ]['{}[]()'.indexOf(token)],
        }

    // Operator
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
 * @returns {Token[]} - List of tokens
 */
function lex(src) {
    let i = 0, prev = 0;
    const ret = [];

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
            ret.push(src.substring(prev, i));
            ret.push(src[i]);

        // Line-Comment
        } else if (src[i] === '#') {
            ret.push(src.substring(prev, i));
            while (i < src.length && src[i] !== '\n')
                i++;

        // End of token
        } else if ([' ', '\t', '\n'].includes(src[i])) {
            ret.push(src.substring(prev, i));
        // String literal
        } else if (['"', "'"].includes(src[i])) {
            ret.push(src.substring(prev, i));
            prev = i;
            endStr();
            i++;
            ret.push(src.substring(prev, i));
        
        // Middle of a token
        } else {
            i++;
            continue;
        }
        
        prev = ++i;
    }

    // Return list of token objects
    return ret
        .map(s => s.trim()).filter(s => s.length)
        .map(toToken);
}

// Export
module.exports = { lex, TokenType, toToken };