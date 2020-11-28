
/*
 * Here are some reasons to stop the user from compiling Probably more will come as more things are added
 */

// Base Class for parse-time errors
class ParseError extends Error {
    /**
     * @param {String} msg - Reason
     */
    constructor(msg) {
        super();
        this.msg = msg;
    }

    // TODO toString or sth
}

// Reference specific section(s) of code
class SyntaxError extends ParseError {
    /**
     * @param {String} msg - Reason
     * @param {Token[] | Token} tokens - Location
     * @param {Context} ctx - parser context
     */
    constructor(msg, tokens, ctx) {
        super(msg);
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

//
module.exports = {
    ParseError,
    SyntaxError,
    // ValueError,
    // DataError,
    // ValueTypeError,
    // DataTypeError,
    // DataValueError,
};