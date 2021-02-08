const Context = require("./context");

/* TODO
 * Break this into OOP approach
 * - Macro abstract base class
 * - LiteralMacro - macro that interprets user-source
 * - InternalMacro - macro that executes javascript
 */

/**
 * Macros are similar to blocks of code, or executable arrays in postscript
 */
module.exports = class Macro {
    /**
     * @param {(Context, Token) => Any} action - body of the macro
     * @param {LexerToken[]|null} [body] - optional body
     */
    constructor(action, body = null) {
        this.action = action;
        this.body = body;
    }

    /**
     * Construct Macro object from literal token
     * @param {Context} ctx - context for literal
     * @param {LexerToken} token - token for literal
     * @param {Function} parse - function for parser
     * @returns {Macro} - New Macro object for literal
     */
    static fromLiteral(ctx, token, parse) {
        // Copy lexical scopes
        const scopesCp = ctx.scopes.slice();

        // This will be the action for the macro
        const action = (ctx, token_) => {
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
        return new Macro(action, token.body);
    }
};