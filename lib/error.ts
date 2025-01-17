
/**
 * Here are some reasons to stop the user from compiling
 * Probably more will come as more things are added
 */

import type Context from "./context.js";
import { LexerToken } from "./scan.js";
import type { Type } from "./datatypes.js";
import type * as value from './value.js';
import type { Expr } from "./expr/index.js";

// TODO need to make an error datatype that combines these into a single error

// TODO Only a few of these are used atm ...

export class CompilerError extends Error {}

// Base Class for parse-time errors
export class ParseError extends CompilerError {
    /**
     * @param message - Reason
     */
    constructor(message: string) {
        super(message);
    }

    // TODO toString or sth
}

// Reference specific section(s) of code
export class SyntaxError extends ParseError {
    tokens: LexerToken[];

    /**
     * @param message - Reason
     * @param tokens - Location in code
     * @param ctx - parser context
     */
    constructor(message: string, tokens: LexerToken | LexerToken[], public ctx?: Context) {
        super(message);
        this.ctx = ctx;

        if (!(tokens instanceof Array))
            tokens = [tokens];
        this.tokens = tokens;
    }

    /**
     * Remove adjacent duplicate tokens
     * @returns modified this.tokens
     */
    dedupTokens(): LexerToken[] {
        if (this.tokens.length === 0)
            return [];
        let p: LexerToken;
        this.tokens = this.tokens.filter(t => t && t !== p ? (p = t) : false);
        return this.tokens;
    }
}

export class TypeError extends SyntaxError {
    /**
     * @constructor
     * @param message Reason
     * @param tokens location in code
     * @param vs offending value/expression
     * @param expected type expected
     * @param ctx parser context
     */
    constructor(
        message: string,
        tokens: LexerToken | LexerToken[],
        public vs: Array<value.Value | Expr>,
        public expected?: Type[],
        ctx?: Context,
    ) {
        super(message, tokens, ctx);
    }
}

export class StackTypeError extends SyntaxError {
    constructor(
        message: string,
        tokens: LexerToken | LexerToken[],
        public values: Array<value.Value | Expr>,
        public expected: Type[],
        ctx?: Context,
    ) {
        super(message, tokens, ctx);
        // TODO this probably gets logged incorrectly
        this.message += this.typeMismatchStr() + '\n\nContext:';
    }

    typeMismatchStr(): string {
        const vs = this.values.slice(0 - this.expected.length);
        const matching = this.expected.map((t, i) => t.check(vs[i].datatype));
        const typeMatchStr = matching.map((m, i) => m
            ? `\t- ${this.expected[i].toString()}\n`
            : `\t- Expected ${this.expected[i].toString()} got ${vs[i].datatype.toString()}`
        ).join('\n');
        return 'Stack Types Alignment:\n' + typeMatchStr;
    }
}

// TODO more, better errors which can get displayed more readably with additional info