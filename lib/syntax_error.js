
/*
 * Here are some reasons to stop the user from compiling Probably more will come as more things are added
 */

// Base Class for parse-time errors
class ParseError {
    /**
     * @param {String} msg - Reason
     */
    constructor(msg) {
        this.msg = msg;
    }
}

// Reference specific section(s) of code
class SyntaxError {
    /**
     * @param {String} msg - Reason
     * @param {LexerToken} tokens - Location
     */
    constructor(msg, tokens) {
        super(msg);
        this.tokens = tokens;
    }
};

// Unexpected Expression Syntactic Type
class ValueTypeError extends SyntaxError {
    constructor(msg, tokens, values) {

    }
};

// Received a DataValue as expected but it's wrong .datatype
class DataTypeError extends SyntaxError {

};

// Unexpected
class DataValueError extends SyntaxError {

};



module.exports = {
    SyntaxError,

}