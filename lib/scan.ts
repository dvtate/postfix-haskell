import { formatErrorPos } from "../tools/util.js";
import WasmNumber from "./numbers.js";

// This handles Context-free grammar

// TODO optimize, use regex, char literals, etc.
// TODO this file is ugly

/**
 * Lexical type for token
 */
export enum TokenType {
    String = 0,         // String literal
    Number = 1,         // Number literal
    ContainerOpen = 2,  // Container open (temporary)
    ContainerClose = 3, // Container close (temporary)
    Identifier = 4,     // Identifier
    Block = 5,          // Macro
    Tuple = 6,          // Tuple
}

// Internal
export enum ContainerType {
    Curly = 0,      // {}
    Bracket = 1,    // []
    Paren = 2,      // ()
}

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
}

// Number literal
export class NumberToken extends LexerToken {
    value: WasmNumber;

    constructor(token: string, position: number, file: string) {
        super(token, TokenType.Number, position, file);
        this.value = new WasmNumber().fromString(token);
    }
}

/**
 * The Token is initialized as a container open/close token
 * later it's converted to a block and the body is assigned
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

    isMacro() {
        return this.subtype === ContainerType.Paren
            && this.body
            && this.body.slice(0, 4).some(t => t.token === ':' || t.token === 'rec:');
    }

    toMacro() {
        // Not a macro
        if (!this.isMacro()) {
            this.type = TokenType.Tuple;
            return this;
        }

        const types: BlockToken[] = [];
        let recursive = false;
        let i : number;
        const l = Math.min(4, this.body.length)
        for (i = 0; i < l; i++) {
            const t = this.body[i];
            if (t.token === ':')
                break;
            if (t.token === 'rec:') {
                recursive = true;
                break;
            }
            if (t.token === 'rec')
                recursive = true;
            else if (t instanceof BlockToken)
                types.push(t);
            else
                throwParseError('invalid macro prefix', [this, t], this.file);
        }

        return new MacroToken(
            this.token,
            this.position,
            this.file,
            this.body.slice(i + 1),
            types,
            recursive
        );
    }

    /**
     * Get a list of identifiers referenced within the body of this block
     * @returns array of identifier tokens in the body
     */
    referencedIds(): IdToken[] {
        const ret: IdToken[] = [];
        this.body.forEach(tok => {
            if (tok instanceof BlockToken)
                ret.push(...tok.referencedIds())
            else if (tok instanceof IdToken)
                ret.push(tok);
        });
        return ret;
    }
}

export class MacroToken extends LexerToken {
    constructor(
        token: string,
        position: number,
        file: string,
        public body: LexerToken[],
        public types: BlockToken[],
        public recursive = false,
    ) {
        super(token, TokenType.Block, position, file);
    }
}

export class IdToken extends LexerToken {
    value: string[];
    isEscaped: boolean;
    constructor(token: string, position: number, file: string) {
        super(token, TokenType.Identifier, position, file);
        this.isEscaped = this.token[0] === '$';
        const unescaped = this.isEscaped ? this.token.slice(1) : this.token;
        // TODO handle when token is "." or "..." or "..abc" this could be useful?
        this.value = unescaped.split('.');
    }
}

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
        return new LexerToken(token.substring(1, token.length - 1), TokenType.String, position, file);

    // Number (note this makes NaN an identifier)
    if (!isNaN(parseFloat(token)))
        return new NumberToken(token, position, file);

    // Separators
    if ('{}[]()'.includes(token))
        return new BlockToken(token, position, file);

    // Identifier
    return new IdToken(token, position, file);
}

/**
 * Generates a list of tokens from given program source
 *
 * @param src - program source code
 * @param file - file name/path
 * @returns - List of tokens
 */
export function lex(src: string, file?: string): LexerToken[] {
    let i = 0,
        prev = 0;
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
}

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
        name: 'LexerError',
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
    // Parse tokens
    const tokens = lex(code, file);
    const ret: LexerToken[] = [];
    tokens.forEach(tok => {
        // Collapse containers
        if (tok.type == TokenType.ContainerClose) {
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
            const parent = ret[ind] as BlockToken;
            if (parent.subtype !== (tok as BlockToken).subtype)
                throwParseError(`Container mismatch ${parent.token} vs. ${tok.token}`, [parent, tok]);

            // Collapse body
            parent.body = ret.splice(ind + 1);
            ret[ind] = parent.toMacro();
        } else {
            ret.push(tok);
        }
    });
    return ret;
}

/**
 * Used for code originating within the compiler
 */
export const internalToken = new IdToken('compiler internal', 0, '/dev/null');