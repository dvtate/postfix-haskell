import * as types from './datatypes.js';
import Context from "./context.js";
import { BlockToken, IdToken, LexerToken, MacroToken, TokenType } from "./scan.js";
import parse from "./parse.js";
import Namespace from "./namespace.js";
import * as error from './error.js';
import * as value from './value.js';
import * as expr from './expr/index.js';

/**
 * Return Type for macro implementations
 */
export type ActionRet = Context | Array<string> | undefined | SyntaxError | void;

/**
 * Invokable block of code
 */
export abstract class Macro extends value.Value {
    type: value.ValueType.Macro = value.ValueType.Macro;
    declare value: undefined;

    /**
     * @override
     */
    _datatype: types.ArrowType = null;
    get datatype(): typeof this._datatype | types.SyntaxType {
        return this._datatype || types.SyntaxType.ValueTypes[value.ValueType.Macro];
    }
    set datatype(t: types.ArrowType | types.SyntaxType) {
        if (t instanceof types.ArrowType)
            this._datatype = t;
    }

    /**
     * Did the user flag this macro as recursive?
     */
    recursive = false;
    recursiveId: IdToken = null;

    constructor(token: LexerToken, type: types.ArrowType = null, recursive = false) {
        super(token, value.ValueType.Macro, undefined, type);
        this.recursive = recursive;
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
    inferDatatype(
        ctx: Context,
        inputTypes: types.Type[],
        token: LexerToken = this.token
    ): types.ArrowType | error.SyntaxError | string {
        // const cached = this.matchingDatatypes.find(t => t.checkInputTypes(inputTypes));
        // if (cached)
        //     return cached;

        // if (inputTypes.some(t => t.isWild()))
        //     return 'wild inputs';

        // Unable to trace syntax types
        if (inputTypes.some(t => !(t instanceof types.DataType)))
            return new types.ArrowType(token, inputTypes);

        // Generate dummy inputs
        const inputs = (inputTypes as types.DataType[]).map(t => expr.DummyDataExpr.create(token, t));
        ctx.stack.push(...inputs);

        // Trace the macro
        // TODO when given number of inputs we should include untouched values as outputs
        const ios = ctx.traceIO(this, token);
        ctx.popn(inputs.length);
        if (ios instanceof error.SyntaxError)
            return ios;
        if (ios === null)
            return new error.SyntaxError('Cannot infer datatype (probably due to recursion)', token, ctx);

        // Validate trace
        if (ios.takes.length > inputs.length)
            return 'differing input lengths';

        // Untouched, designated inputs are still inputs
        //  special case for identity macro
        if (ios.takes.length < inputs.length) {
            ios.gives = (inputs as value.Value[])
                .slice(0, inputs.length - ios.takes.length)
                .concat(ios.gives);
            ios.takes = inputs;
        }

        // if (ios.takes.some((e, i) => e !== inputs[i])) {
        //     console.error(ios.takes, 'vs', inputs);
        //     return 'differing input values';
        // }
        if (ios.takes.some(v => !v.datatype))
            throw new Error('wtf?');
        if (ios.gives.some(v => !v.datatype))
            return new error.SyntaxError(
                `macro returns untyped value ${ios.gives.find(v => !v.datatype).typename()}`,
                token,
                ctx,
            );

        // Add match
        // TODO the outputTypes should be merged with unused inputtypes
        const ret = new types.ArrowType(
            token,
            (inputTypes as types.DataType[]),
            ios.gives.map(v => v.datatype),
        );
        return ret;
    }

    /**
     * Verify this macro has specified type
     * @param ctx parser context
     * @param datatype type to check against
     * @param token location in code where check is required
     * @param safe
     * @returns true/false if checks or not or a syntax error
     */
    typeCheck(
        ctx: Context,
        datatype: types.ClassOrType<types.TupleType | types.ArrowType>,
        token: LexerToken = this.token,
        safe = false,
    ): boolean | error.SyntaxError {
        // No need to inference if we already know the datatype
        if (this._datatype)
            return datatype.check(this._datatype);

        // Drop classes
        if (datatype instanceof types.ClassType)
            datatype = datatype.getBaseType();
        // if (this.matchingDatatypes.some(t => t.check(datatype)))
        //     return true;
        // if (this.failedDatatypes.some(t => t.check(datatype)))
        //     return false;

        // Generate type from partial
        const baseType = (datatype instanceof types.ClassType ? datatype.getBaseType() : datatype) as types.TupleType | types.ArrowType;
        const dt = this.inferDatatype(
            ctx,
            baseType instanceof types.TupleType
                ? baseType.types
                : baseType.inputTypes,
            token,
        );

        // Invalid macro
        // TODO this could mean it's just incorrectly typed...
        if (dt instanceof error.SyntaxError)
            return !safe && dt;

        // Verify type
        if (dt instanceof types.ArrowType) {
            const ret = datatype.check(this._datatype);
            // if (ret)
            //     this.matchingDatatypes.push(dt);
            // else
            //     this.failedDatatypes.push(dt);
            return ret;
        }

        // Invalid type
        // TODO shouldn't need these warnings in the future
        ctx.warn(token, 'could not infer partial type: ' + (dt || ''));
        return false;
        // return new error.SyntaxError('could not infer partial type: ' + (dt || ''), token, ctx);
    }

    /**
     * Typecheck inputs to this macro
     * @param stack stack at point of invocation
     * @returns false if invalid true otherwise
     */
    checkInputs(stack: value.Value[]) {
        return !this._datatype || this._datatype.checkInputs(stack);
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
    scopes: Array<{ [k: string] : value.Value }>; // TODO refactor into separate class

    // Cannot infer return type for wildcards so can't make arrow type
    // But still we want to verify the input matches
    inputTypes?: types.Type[];

    /**
     * Construct Macro object from literal token
     * @param ctx - context for literal
     * @param token - token for literal
     */
    constructor(ctx: Context, token: MacroToken | BlockToken) {
        super(token);
        this.body = token.body;
        this.scopes = ctx.scopes.slice();
        this.recursive = token instanceof MacroToken && token.recursive;
        this.recursiveId = token instanceof MacroToken && token.recursiveId;
    }

    /**
     * @override
     */
    action(ctx: Context, token: LexerToken, recValue: value.Value = this): ActionRet {
        // TODO simplify and/or use ctx.copyState()
        // Use proper lexical scope
        const oldScopes = ctx.scopes;
        ctx.scopes = this.scopes;
        ctx.scopes.push(this.recursiveId
            ? { [this.recursiveId.token.slice(1)] : recValue }
            : {});

        // Invoke body
        let ret;
        try {
            ret = parse(this.body, ctx);
        } catch (e) {
            // Always Restore ctx state
            ctx.scopes.pop();
            ctx.scopes = oldScopes;
            if (e instanceof error.SyntaxError)
                e.tokens.push(token);
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
    getNamespace(ctx: Context, token: LexerToken, recValue: value.Value = this): value.NamespaceValue | error.SyntaxError {
        // TODO simplify and/or use ctx.copyState()
        // Use proper lexical scope
        const oldScopes = ctx.scopes;
        ctx.scopes = this.scopes;
        ctx.scopes.push(this.recursiveId
            ? { [this.recursiveId.token.slice(1)] : recValue }
            : {});

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

    /**
     *
     * @param ctx compiler context
     * @param inputs input datatypes
     * @param outputs output datatypes
     * @returns void if successful, anything else if error
     */
    applyType(ctx: Context, inputs: types.TupleType, outputs?: types.TupleType): void | error.SyntaxError | string[] | types.ArrowType {
        // Attempt to infer output types from inputs
        const type = this.inferDatatype(ctx, inputs.types, this.token);
        this.inputTypes = inputs.types;
        // if (this.inputTypes.length == 2)
        //     console.log(type);

        // Cannot infer output types when wildcards given as input
        if (type === 'wild inputs')
            return;

        if (typeof type == 'string')
            return new error.SyntaxError(type, this.token, ctx);

        // NOTE in the past it would complain if the user gives a macro an invalid signature
        //      but this almost always is a false-alarm.
        // TODO flag which makes compiler trust and enforce user provided type signatures
        if (type instanceof error.SyntaxError)
            return;

        // Verify outputs
        if (outputs && type.outputTypes && !outputs.types.every((t, i) => t.check(type.outputTypes[i]))) {
            ctx.warn(this.token, 'incorrectly typed macro');
            console.warn('incorrectly typed macro, should be', type.toString());
            // return type;
        }

        // Apply datatype
        this._datatype = type;
    }

    toString() {
        return `LiteralMacro { ${this.token.file || ''}:${this.token.position} }`;
    }

    /**
     * @override
     */
    checkInputs(stack: value.Value[]) {
        // add check for partially typed macros in order to support wildcards
        return super.checkInputs(stack) || (
            this.inputTypes
            && stack.length >= this.inputTypes.length
            && stack
                .slice(-this.inputTypes.length)
                .every((v, i) => v.datatype && this.inputTypes[i].check(v.datatype))
        );
    }

    toClosure(ctx: Context, token: LexerToken = this.token): expr.ClosureCreateExpr | error.SyntaxError {
        if (!this.datatype)
            return new error.SyntaxError('Untyped macros cannot form closures', [], ctx);
        return new expr.ClosureCreateExpr(token, this);
    }
}