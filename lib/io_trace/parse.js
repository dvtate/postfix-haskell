
const Macro = require('../macro');
const value = require('../value');
const { Value } = require('../value');

const globals = {
    '+' : new Value(null, value.ValueType.Macro, new Macro(

    ));
};


class Context {
    constructor() {
        this.stack = [];
        this.trace = [];
        this.scopes = [{}];
        this.globals = {};
    }
};

function parse(macro) {

}