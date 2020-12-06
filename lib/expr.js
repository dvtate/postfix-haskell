

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
     */
    out() {
        return '';
    }
};


/**
 * Describes branching actions
 */
class BranchExpr extends Expr {
    /**
     *
     * @param {Token} token
     * @param {*} conditions
     * @param {*} actions
     */
    constructor(token, conditions, actions) {
        super(token);
        this.conditions = conditions;
        this.actions = actions;
    }
};