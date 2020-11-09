const Context = require("./context");

//
module.exports = class Macro {
    /**
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
     * Construct Macro object from literal token
     * @param {Context} ctx - context for literal
     * @param {LexerToken} token - token for literal
     */
    static fromLiteral(ctx, token) {
        // Copy lexical scopes
        const scopesCp = ctx.scopes.slice();

        // This will be the action for the macro
        const action = (ctx, e_token) => {
            // Invoke macro in proper lexical scope
            // TODO simplify this
            const oldScopes = ctx.scopes;
            ctx.scopes = scopesCp;
            ctx.scopes.push({});
            const ret = parse(token.body, ctx);
            ctx.scopes.pop();
            ctx.scopes = oldScopes;
            return ret;
        };

        // Make Macro
        return new Macro(action, ctx, token.body);
    }
};