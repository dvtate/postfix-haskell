const value = require('./value');

/**
 * This stores expressions that we can reason about
 * but can't completly eliminate from the code.
 *
 * For example, operations on user input and not constant-values
 */
module.exports = class Expr {
    /**
     * @param {*} token
     */
    constructor(token) {
        this.token = token;
    }

    /**
     * Compilation action
     * @virtual
     * @returns {string} - wasm translation
     */
    out() {
        return '';
    }
};

/**
 * Describes branching action
 */
class BranchExpr extends Expr {
    /**
     * @param {Token} token
     * @param {Expr[]} conditions
     * @param {Expr[]} actions
     */
    constructor(tokens, conditions, actions) {
        super(tokens[0]);
        this.tokens = tokens;
        this.conditions = conditions;
        this.actions = actions;
    }

    /**
     *
     * @param {Context} ctx - parser context
     * @param {Fun} fun - Function to wrap
     */
    fromFun(ctx, fun) {
        return new BranchExpr();
    }

    /**
     * @override
     */
    out() {
        // TODO fuggggg
    }
};

/**
 * Constant value that we're treating as an Expr
 */
class ValueExpr extends Expr {
    /**
     * @param {Token} token - Location in code
     * @param {Value} value - Value to wrap
     */
    constructor(token, value) {
        super(token);
        this.value = value;
    }

    /**
     * @override
     */
    out() {
        const outValue = v => v instanceof value.TupleValue
            ? this.value.map(outValue).join()
            : this.value.toWAST();
        return outValue(this.value);
    }
};

/**
 * Passes stack arguments to desired WASM instruction
 */
class InstrExpr extends Expr {
    constructor(token, instr, args) {
        super(token);
        this.instr = instr;
        this.args = args;
    }

    /**
     * @override
     */
    out() {
        return this.args.map(a => a.out()).join('\n') + this.instr;
    }
};

/**
 * Label to enable recursion
 */
class LabelExpr extends Expr {
    /**
     *
     * @param {Token} token
     * @param {Expr} target
     */
    constructor(token, target) {
        super(token);
        this.target = target;
        this.origins = [];
    }

    /**
     * @override
     */
    out() {
        return this.target.out();
    }
};

/**
 * Blind jump to label
 */
class JumpExpr extends Expr {
    /**
     *
     * @param {Token} token - Source location
     * @param {LabelExpr} target - Where to jump to
     * @param {Expr[]} args - Args for recursive call
     */
    constructor(token, target, args) {
        super(token);
        this.target = target;
        this.args = args;
        target.origins.push(this);
    }

    /**
     * @override
     */
    out() {
        // TODO
    }
};

/**
 * Function Export expression
 */
class FunExportExpr extends Expr {
    /**
     * @param {Token} token - Source location
     * @param {string} name - Export label
     * @param {PrimitiveType[]} inputTypes - Types for input values
     * @param {Expr[]} outputs - Generated exprs for return values
     */
    constructor(token, name, inputTypes, outputs) {
        super(token);
        this.name = name;
        this.inputTypes = inputTypes;
        this.outputs = outputs;
    }
};

/**
 * Function parameters expression
 */
class ParamExpr extends Expr {
    constructor(token, type, index)
};


module.exports = {
    Expr,
    BranchExpr,
    ValueExpr,
    InstrExpr,
    LabelExpr,
    JumpExpr,
    FunExportExpr,
    ParamExpr,
};