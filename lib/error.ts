
/*
 * Here are some reasons to stop the user from compiling Probably more will come as more things are added
 */

import { Context } from "vm";
import { LexerToken } from "./scan";

// Base Class for parse-time errors
export class ParseError extends Error {
    /**
     * @param message - Reason
     */
    constructor(message: string) {
        super(message);
    }

    // TODO toString or sth
};

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
        this.tokens = tokens instanceof Array ? tokens : [tokens];
        this.ctx = ctx;
    }
};

// Invalid Expression
class ValueError extends SyntaxError {};

// Invalid Data Expression
class DataError extends SyntaxError {};

// Unexpected Expression Syntactic Type
class ValueTypeError extends ValueError {};

// Received a DataValue as expected but it's wrong .datatype
class DataTypeError extends SyntaxError {};

// Unexpected
class DataValueError extends SyntaxError {};
