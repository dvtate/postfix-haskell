import Context from "./context";
import { BlockToken, LexerToken } from "./scan";
import parse from "./parse";
import * as error from './error';
import { Type } from "./datatypes";
import * as value from './value';

// TODO add arrow type
// TOOD make it extend Value - not addressing because not clear what the `.value` would be

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

    /**
     * Invoke macro
     * @virtual
     * @param ctx - Context object
     * @param token - token of invokee
     * @returns - Macro return
     */
    action(ctx: Context, token: LexerToken): ActionRet {}
}

/**
 * A macro that is created internally by the compiler
 */
export class CompilerMacro extends Macro {
    /**
     * @param invokeAction - body of the macro
     */
    constructor(
        private invokeAction: (ctx: Context, token: LexerToken) => ActionRet,
        public name?: string
    ) {
        super();
    }

    /**
     * @override
     */
    action(ctx: Context, token: LexerToken): ActionRet {
        return this.invokeAction(ctx, token);
    }

    // TODO toString for debugging
    toString(){
        return `CompilerMacro { ${this.name} }`;
    }
};

/**
 * User-defined macros only
 */
export class LiteralMacro extends Macro {
    token: BlockToken;
    body: LexerToken[];
    scopes: Array<{ [k: string] : value.Value }>;

    /**
     * Construct Macro object from literal token
     * @param ctx - context for literal
     * @param token - token for literal
     */
    constructor(ctx: Context, token: BlockToken) {
        super();
        this.token = token;
        this.body = token.body;
        this.scopes = ctx.scopes.slice();
    }

    /**
     * @override
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
     * Convert scope into an invokable macro
     * Takes Id and Gives it namespace as it's scope
     * @param token - token of the namespace
     * @param scope - sope of the
     * @returns - Macro Value that when given an id returns corresponding id in namespace
     */
    private static toNsMacro(
        token: LexerToken,
        scope: { [k: string]: value.Value },
    ): value.MacroValue {
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

    toString() {
        return `LiteralMacro { ${this.token.file || this.token.position} }`;
    }
};