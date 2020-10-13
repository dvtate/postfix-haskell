const Context = require("./context");

//
module.exports = class Macro {
    /**
     *
     * @param {function} action
     * @param {Context} [ctx]
     * @param {Object} [body]
     */
    constructor(action, ctx, body = null) {
        this.action = action;
        this.scopes = ctx && ctx.scopes.slice();
        this.body = body;
    }

    /**
     * @returns {Macro}
     */
    clone() {
        return new Macro(this.action, { scopes: this.scopes }, this.body);
    }
};