import Context from "./context";
import { BlockToken, LexerToken } from "./scan";
import parse from "./parse";
import { Namespace } from "./namespace";
import * as error from './error';
import * as value from './value';
import * as types from './datatypes';
import * as expr from './expr';

// TODO add arrow type
// TOOD make it extend Value - not addressing because not clear what the `.value` would be

// Return Type for macro implementations
export type ActionRet = Context | Array<string> | undefined | SyntaxError | void;

type ClassOrType<T extends types.Type> = T | types.ClassType<ClassOrType<T>>;

/**
 * Invokable block of code
 */
export abstract class Macro extends value.Value {
    type: value.ValueType.Macro = value.ValueType.Macro;
    datatype: types.ArrowType = null;
    value: undefined;

    /**
     * Did the user flag this macro as recursive?
     */
    recursive = false;

    constructor(token: LexerToken, type: types.ArrowType = null) {
        super(token, value.ValueType.Macro, null, type);
    }

    /**
     * Invoke macro
     * @virtual
     * @param ctx - Context object
     * @param token - token of invokee
     * @returns - Macro return
     */
    abstract action(ctx: Context, token: LexerToken): ActionRet;

    /**
     * Determine the complete datatype of the macro given only input types
     * @param ctx context
     * @param token location in the code where inferrence is needed
     * @param inputTypes required given input datatypes
     * @returns An arrow type for the datatype of the macro
     */
    inferDatatype(ctx: Context, inputTypes: types.Type[], token: LexerToken = this.token): types.ArrowType | error.SyntaxError | string {
        // Generate dummy inputs
        const inputs = inputTypes.map(t => new expr.DummyDataExpr(token, t))
        ctx.stack.push(...inputs);

        // Trace the macro
        const ios = ctx.traceIO(this, token);
        if (ios instanceof error.SyntaxError)
            return ios;
        ctx.popn(inputs.length);

        // Validate trace
        if (ios.takes.length != inputs.length)
            return 'differing input lengths';
        if (ios.takes.some((e, i) => e !== inputs[i]))
            return 'differing input values';
        if (ios.takes.some(v => !v.datatype)) // todo this only for debugging
            throw new Error('wtf?');
        if (ios.gives.some(v => !v.datatype))
            return new error.SyntaxError(`macro returns untyped value ${
                ios.gives.find(v => !v.datatype).typename()
                }`, token, ctx);

        return this.datatype = new types.ArrowType(
            token,
            ios.takes.map(v => v.datatype),
            ios.gives.map(v => v.datatype)
        );
    }

    typeCheck(
        ctx: Context,
        datatype: ClassOrType<types.TupleType | types.ArrowType>,
        token: LexerToken = this.token
    ): boolean | error.SyntaxError {
        // No need to inference if we already know the datatype
        if (this.datatype)
            return datatype.check(this.datatype);

        // Generate type from partial
        // NOTE this also sets this.datatype
        const baseType = datatype.getBaseType() as types.TupleType | types.ArrowType;
        const dt = this.inferDatatype(
            ctx,
            baseType instanceof types.TupleType
                ? baseType.types
                : baseType.inputTypes,
            token,
        );

        // Invalid macro
        if (dt instanceof error.SyntaxError)
            return dt;

        // Verify type
        if (dt instanceof types.ArrowType) {
            return datatype.check(this.datatype);
        }

        // Invalid type
        // TODO shouldn't need these warnings in the future
        ctx.warn(token, 'could not infer partial type: ' + (dt || ''));
        return false;
        // return new error.SyntaxError('could not infer partial type: ' + (dt || ''), token, ctx);
    }
}

/**
 * A macro that is created internally by the compiler
 */
 export class CompilerMacro extends Macro {
    /**
     * @param invokeAction - body of the macro
     * @param [name] - debugging symbol for the macro
     */
    constructor(
        token: LexerToken,
        private invokeAction: (ctx: Context, token: LexerToken) => ActionRet,
        public name?: string,
        datatype?: types.ArrowType,
    ) {
        super(token, datatype);
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
}

/**
 * User-defined macros
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
        super(token);
        this.body = token.body;
        this.scopes = ctx.scopes.slice();
    }

    /**
     * @override
     */
    action(ctx: Context): ActionRet {
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
     * Handle namespace call
     * @param ctx - context object
     * @param token - invokee token
     * @returns - on success return namespace accessor macro on otherwise returns error
     */
    getNamespace(ctx: Context, token: LexerToken): value.NamespaceValue | error.SyntaxError {
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
            ? new value.NamespaceValue(token, new Namespace(newScope, token))
            : ret;
    }

    toString() {
        return `LiteralMacro { ${this.token.file || this.token.position} }`;
    }
}