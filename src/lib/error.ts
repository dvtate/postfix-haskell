
/*
 * Here are some reasons to stop the user from compiling Probably more will come as more things are added
 */

import { Context } from "vm";
import { LexerToken } from "./scan";
import * as value from './value';
import { Expr } from "./expr";
import { Type } from "./datatypes";

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
    ctx?: Context;

    /**
     * @param message - Reason
     * @param tokens - Location
     * @param ctx - parser context
     */
    constructor(message: string, tokens: LexerToken | LexerToken[], ctx?: Context) {
        super(message);
        this.ctx = ctx;

        // Dedup tokens into this.tokens
        if (!(tokens instanceof Array))
            tokens = [tokens];
        let p = tokens[0];
        this.tokens = [p];
        tokens.forEach(t => {
            if (p !== t) {
                this.tokens.push(t);
                p = t;
            }
        });
    }
}

export class TypeError extends SyntaxError {
    /**
     * @constructor
     * @param message Reason
     * @param tokens location in code
     * @param v offending value/expression
     * @param expected type expected
     * @param ctx parser context
     */
    constructor(
        message: string,
        tokens: LexerToken | LexerToken[],
        public v: value.Value | Expr,
        public expected?: Type,
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
        public expected?: Type[],
        ctx?: Context,
    ) {
        super(message, tokens, ctx);
    }
}

// TODO more, better errors which can get displayed more readably with additional info