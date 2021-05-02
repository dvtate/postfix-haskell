import Context from "./context";
import { BlockToken, LexerToken } from "./scan";
import parse from "./parse";
import * as error from './error';
import { Type } from "./datatypes";


/* TODO
 * Break this into OOP approach
 * - Macro abstract base class
 * - LiteralMacro - macro that interprets user-source
 * - InternalMacro - macro that executes javascript
 */

// TODO add arrow type
// TOOD make it extend Value
// TODO make a child class for StringLiterals

/**
 * Macros are similar to blocks of code, or executable arrays in postscript
 */
export default class Macro {
    action: (ctx: Context, token: LexerToken) => Context | Array<string> | undefined | SyntaxError;
    body?: LexerToken[];

    /**
     * @param action - body of the macro
     * @param body - optional body source
     */
    constructor(action, body?) {
        this.action = action;
        this.body = body;
    }

    /**
     * Construct Macro object from literal token
     * @param ctx - context for literal
     * @param token - token for literal
     * @param parse - function for parser
     * @returns - New Macro instance for literal
     */
    static fromLiteral(ctx: Context, token: BlockToken, parse: (toks: LexerToken[], ctx: Context) => Context | error.SyntaxError): Macro {
        // Copy lexical scopes
        const scopesCp = ctx.scopes.slice();

        // This will be the action for the macro
        const action = (ctx, token_) => {
            // TODO simplify and/or use ctx.copyState()

            // Use proper lexical scope
            const oldScopes = ctx.scopes;
            ctx.scopes = scopesCp;
            ctx.scopes.push({});

            // Invoke body
            let ret;
            try {
                ret = parse(token.body, ctx);
            } catch (e) {
                // Always Restore ctx state
                ctx.scopes.pop();
                ctx.scopes = oldScopes;
                throw e;
            }

            // Restore ctx state
            ctx.scopes.pop();
            ctx.scopes = oldScopes;
            return ret;
        };

        // Make Macro
        return new Macro(action, token.body);
    }

    // TODO toString for debugging
};