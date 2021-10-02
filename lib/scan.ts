import { formatErrorPos } from "../tools/util";
import WasmNumber from "./numbers";

// This handles Context-free grammar

// TODO optimize, use regex, etc.
// TODO chars

/**
 * Lexical type for token
 */
export enum TokenType {
    String = 0,         // String literal
    Number = 1,         // Number literal
    ContainerOpen = 2,  // Container open (temp)
    ContainerClose = 3, // Container close (temp)
    Identifier = 4,     // Identifier
    Block = 5,          // Macro
};

// Internal
export enum ContainerType {
    Curly = 0,      // {}
    Bracket = 1,    // []
    Paren = 2,      // ()
};

// Generic token
export class LexerToken {
    static Type = TokenType;

    constructor(
        public token : string,
        public type? : TokenType,
        public position? : number,
        public file? : string,
    ) { }

    // TODO toString()

    locationString() {
        return formatErrorPos([{
            name: this.constructor.name + ' token',
            message: this.constructor.name + ' token',
            tokens: [this],
        }]);
    }
};

// Number literal
export class NumberToken extends LexerToken {
    value: WasmNumber;

    constructor(token: string, position: number, file: string) {
        super(token, TokenType.Number, position, file);
        this.value = new WasmNumber().fromString(token);
    }
};

/**
 * The Token is initialized as a container open/close token
 * later it's converted to a block and the body is assgined
 */
export class BlockToken extends LexerToken {
    subtype: ContainerType;
    body!: Array<LexerToken>;

    constructor(token: string, position: number, file: string) {
        const type = '[{('.includes(token) ? TokenType.ContainerOpen : TokenType.ContainerClose;
        super(token, type, position, file);
        this.subtype = [
            ContainerType.Curly, ContainerType.Curly,
            ContainerType.Bracket, ContainerType.Bracket,
            ContainerType.Paren, ContainerType.Paren,
        ]['{}[]()'.indexOf(token)];
    }
};

/**
 * Describes tokenized string
 *
 * @param token - lexical token string
 * @param options - override/extend defaults
 */
function toToken(token: string, position: number, file: string): LexerToken {
    // Trim whitespace
    token = token.trim();

    // Filter empty tokens
    if (token.length === 0)
        return null;

    // String
    if (token[0] === '"')
        return new LexerToken(token.substr(1, token.length - 2), TokenType.String, position, file);

    // Number (note this makes NaN an identifier)
    if (!isNaN(parseFloat(token)))
        return new NumberToken(token, position, file);

    // Separators
    if ('{}[]()'.includes(token))
        return new BlockToken(token, position, file);

    // Identifier
    return new LexerToken(token, TokenType.Identifier, position, file);
}

/**
 * Generates a list of tokens from given program source
 *
 * @param src - program source code
 * @param file - file name/path
 * @returns - List of tokens
 */
export function lex(src: string, file?: string): LexerToken[] {
    let i: number = 0,
        prev: number = 0;
    const ret: LexerToken[] = [];

    // Add token to return
    const addToken = (s: string) => ret.push(toToken(s, i, file));

    // Find end of string
    const endStr = () => {
        // Determine if quote is escaped
        function isEscaped(s: string, i: number) {
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
    return ret.filter(Boolean);
};

/**
 * Throw syntax error
 *
 * @param message - reason for error
 * @param tokens - problematic tokens
 * @param file - file name/path
 */
function throwParseError(message: string, tokens: LexerToken[], file?: string) {
    // TODO convert to constructor
    throw {
        type: 'SyntaxError',
        message,
        tokens,
        stack: new Error(),
        file,
    };
}

/**
 * Generates a parse tree from list of tokens
 * Really only benefit here is that this collapses containers
 *
 * @param code - code to scan
 * @param file - file name/path
 */
export default function scan(code: string, file?: string): LexerToken[] {

    const tokens = lex(code, file);
    let ret: LexerToken[] = [];

    // Parse tokens
    tokens.forEach(tok => {
        switch (tok.type) {
            // Collapse containers
            case TokenType.ContainerClose:
                // Index of most recent container
                // TODO use .reverse+findIndex?
                let ind: number;
                for (ind = ret.length - 1; ind >= 0; ind--)
                    if (ret[ind].type === TokenType.ContainerOpen)
                        break;

                // No openers
                if (ind === -1)
                    throwParseError('Unexpected symbol ' + tok.token, [tok]);

                // Not matching
                // @ts-ignore
                if (ret[ind].subtype !== tok.subtype)
                    throwParseError(`Container mismatch ${ret[ind].token} vs. ${tok.token}`, [ret[ind], tok]);

                // Collapse body
                // Note for now only containers are for 'Block'
                (ret[ind] as BlockToken).body = ret.splice(ind + 1);
                ret[ind].type = TokenType.Block;
                break;

            // Handle basic tokens
            default:
                ret.push(tok);
                break;
        }
    });
    return ret;
};