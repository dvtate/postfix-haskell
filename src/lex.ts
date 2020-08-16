


enum TokenType {
    Literal, Separator, Symbol, Identifier, 
};
interface Token {
    token: string;
    type: TokenType;
    subtype: string; // TODO enumerate
};


function toToken(token : string, options?: Token | Object) : Token {
    // String
    if (token[0] === '"') {
        return {
            token,
            type: TokenType.Symbol,
            subtype: 'string',
            ...options,
        };

    // Number
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
 * Compiles 
 * 
 * @param src - program source code
 */
function lex(src : string) : Token[] {
    
    // TODO optimize, use regex, etc.
    const ret : Token[] = [];
    let i = 0, prev = 0;
    
    while (i < src.length) {

        // Find end of string
        const endStr = () => {
            // Determine if quote is escaped
            function isEscaped(s : string, i : number) : boolean {
                let n = false;
                while (s[--i] === '\\')
                    n = !n;
                return n;
            }

            // Find end of string
            while (++i < src.length)
                if (src[i] === '"' && !isEscaped(src, i))
                    break;
        };

        // Reached end of symbol
        if (src[i] === ' ') {
            // Push token
            if (prev !== i) 
                ret.push(toToken(src.substring(prev, i)));
            
            // Find start of next token
            while (src[i] === ' ' && i < src.length)
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
            ret.push(toToken(src.substring(prev, i)));

        } else {
            // Probably part of a symbol... keep chugging
            i++;
            continue;
        }

        // Start of a new token
        prev = i;
    }

    return ret;
}