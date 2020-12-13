
const Macro = require('../macro');
const value = require('../value');

class IoContext {
    constructor() {
        this.stack = [];
        this.trace = [];
        this.scopes = [{}];
        this.globals = {};
    }
};

/**
 *
 * @param {Token[]} tokens
 */
function parse(tokens) {

}