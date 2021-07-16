import Context from "./context";
import { BlockToken, LexerToken } from "./scan";
import parse from "./parse";
import * as error from './error';
import { Type } from "./datatypes";
import * as value from './value';

/* TODO
 * Break this into OOP approach
 * - Macro abstract base class
 * - LiteralMacro - macro that interprets user-source
 * - InternalMacro - macro that executes javascript
 */

// TODO add arrow type
// TOOD make it extend Value
// TODO make a child class for StringLiterals

// Return Type for macro implementations
type ActionRet = Context | Array<string> | undefined | SyntaxError | void;


/**
 * Macros are similar to blocks of code, or executable arrays in postscript
 * @abstract
 */
export class Macro {
    /**
     * Did the user flag this macro as recursive?
     */
    recursive: boolean = false;
}

/**
 * A macro that is created internally by the compiler
 */
export class CompilerMacro extends Macro {
    action: (ctx: Context, token: LexerToken) => ActionRet;

    /**
     * @param action - body of the macro
     */
    constructor(action) {
        super();
        this.action = action;
    }

    // TODO toString for debugging
};

/**
 * User-defined macros only
 */
export class LiteralMacro extends Macro {
    body: LexerToken[];
    scopes: Array<{ [k: string] : value.Value }>;

    /**
     * Construct Macro object from literal token
     * @param ctx - context for literal
     * @param token - token for literal
     */
    constructor(ctx: Context, token: BlockToken) {
        super();
        this.body = token.body;
        this.scopes = ctx.scopes.slice();
    }

    /**
     * called by Macro.action
     * @param ctx - context object
     * @param token - invokee token
     * @returns - macro return
     */
    action(ctx: Context, token: LexerToken): ActionRet {
        // TODO simplify and/or use ctx.copyState()
        // Use proper lexical scope
        const oldScopes = ctx.scopes;
        ctx.scopes = this.scopes;
        ctx.scopes.push({});

        // Invoke body
        let ret;
        try {
            ret = parse(this.body, ctx);
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
    }

    /**
     *
     * @param token - token of the namespace
     * @param scope - sope of the
     * @returns -
     */
    private static toNsMacro(token, scope: { [k: string]: value.Value }): value.MacroValue {
        return new value.MacroValue(token, new CompilerMacro((ctx: Context, token: LexerToken): ActionRet => {
            // Assign the scope to the given identifier
            const id = ctx.pop();
            if (!(id instanceof value.IdValue))
                return ['expected an identifier'];
            id.scopes = [scope];
            ctx.push(id);
        }));
    }

    /**
     * Handle namespace call
     * @param ctx - context object
     * @param token - invokee token
     * @returns - on success return namespace accessor macro on otherwise returns error
     */
    getNamespace(ctx: Context, token: LexerToken): value.MacroValue | error.SyntaxError {
        // TODO simplify and/or use ctx.copyState()
        // Use proper lexical scope
        const oldScopes = ctx.scopes;
        ctx.scopes = this.scopes;
        ctx.scopes.push({});

        // Invoke body
        let ret;
        try {
            ret = ctx.toError(parse(this.body, ctx), token);
        } catch (e) {
            // Always Restore ctx state
            ctx.scopes.pop();
            ctx.scopes = oldScopes;
            throw e;
        }

        // Restore ctx state
        const newScope = ctx.scopes.pop();
        ctx.scopes = oldScopes;

        // On successs return the scope otherwise give the error
        return ret instanceof Context
            ? LiteralMacro.toNsMacro(token, newScope)
            : ret;
    }
}