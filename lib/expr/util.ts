import { LexerToken } from '../scan.js';
import * as error from '../error.js';
import * as value from '../value.js';
import * as types from '../datatypes.js';
import { Expr, DataExpr, FunExpr } from './expr.js';
import ModuleManager from '../module.js';
import Context from '../context.js';
import { EnumValue } from '../enum.js';
import { EnumConstructor } from './enum.js';

/**
 * Flatten a list of mixed values+expressions into a single list of expressions
 * @param vs array of values
 * @returns array of expressions
 */
export function fromDataValue(vs: Array<DataExpr | value.Value>, ctx: Context): DataExpr[] {
    return vs.map(v => {
        // Already an expression
        if (v instanceof DataExpr)
            return v;

        // Wrap numbers
        if (v instanceof value.NumberValue)
            return new NumberExpr(v.token, v);

        // Recursively wrap tuple members
        if (v instanceof value.TupleValue)
            return fromDataValue(v.value, ctx);

        // Convert enum values to enum exprs
        if (v instanceof EnumValue)
            return new EnumConstructor(v.token, v.value, v.getEnumClassType());

        // If a macro gets here it's because it should be a rt closure

        throw new error.TypeError("incompatible value", [v.token], [v], null);
    }).reduce(
        (a: DataExpr[], v: DataExpr | DataExpr[]) =>
            v instanceof Array ? a.concat(v) : (a.push(v), a),
        [],
    );
}

// Construct gc'd value
export function constructGc(e: DataExpr, ctx: ModuleManager, fun?: FunExpr): string {
    const mkObj = e.out(ctx, fun);
    // e.datatype.flatPrimitiveList().forEach(p => {})
    return 'todo';
}

/**
 * Constant value that we're treating as an Expr
 */
export class NumberExpr extends DataExpr {
    declare value: value.NumberValue;

    /**
     * @param token - Location in code
     * @param v - Value to wrap
     */
    constructor(token: LexerToken, v: value.NumberValue) {
        super(token, v.datatype);
        this.value = v;
    }

    /**
     * @override
     */
    out() {
        const outValue = (v: value.Value): string =>
            v instanceof value.TupleValue
                ? v.value.map(outValue).join()
                : v.value.toWAST();
        return outValue(this.value);
    }

    children(): Expr[] {
        return [];
    }

    get expensive(): boolean {
        return false;
    }

    toValue(): value.Value {
        return this.value;
    }
}

/**
 * @depricated don't remember why I made this, not used currently... thonkers
 */
export class TupleExpr extends DataExpr {
    declare value: DataExpr[];

    constructor(token: LexerToken, ctx: Context, v: value.TupleValue) {
        super(token, v.datatype);
        this.value = fromDataValue(v.value, ctx);
    }

    get expensive(): boolean {
        return false;
    }

    out(ctx: ModuleManager, fun?: FunExpr): string {
        return this.value.map(v => v.out(ctx, fun)).join(' ');
    }

    children(): Expr[] {
        return this.value;
    }

    toValue(): value.Value {
        return new value.TupleValue(this.token, this.value);
    }
}

/**
 * For when the output of an expression is stored in a local variable
 *
 * used to handle multi-returns so that they don't get used out of order
 */
 export class DependentLocalExpr extends DataExpr {
    // Expression produces the output captured by this one
    source: Expr;

    // Local variable index to which this value is stored
    inds: number[] = null;

    constructor(token: LexerToken, datatype: types.DataType, source: Expr) {
        super(token, datatype);
        this.source = source;
    }

    out(ctx: ModuleManager, fun: FunExpr) {
        // source.out() will update our index to be valid and capture relevant values
        // into our local
        const ret = `${
            !this.source._isCompiled ? this.source.out(ctx, fun) : ''
        } ${fun.getLocalWat(this.inds)}`;
        this.source._isCompiled = true;
        return ret;
    }

    children() {
        return this.source.children();
    }
}

/**
 * Passes stack arguments to desired WASM instruction
 */
 export class InstrExpr extends DataExpr {
    // WASM instruction mnemonic
    instr: string;

    // Arguments passed
    args: DataExpr[];

    constructor(token: LexerToken, datatype: types.DataType, instr: string, args: DataExpr[]) {
        super(token, datatype);
        this.instr = instr;
        this.args = args;
        // TODO warn if invalid args
    }

    /**
     * @override
     */
    out(ctx: ModuleManager, fun: FunExpr) {
        const ret = `(${this.instr} ${this.args.map(e => e.out(ctx, fun)).join(' ')})`;
        // console.log(this.constructor.name, ret);
        return ret;
    }

    /**
     * @override
     */
    get expensive(): boolean {
        return true;
    }

    children() {
        return this.args;
    }
}

/**
 * Used for repeated expressions
 * Normally we'd try to use something like dup but wasm weird
 * First time it's compiled it stores value in a new local
 * After that it just does local.get
 */
export class TeeExpr extends DataExpr {
    locals: number[] = null;

    /**
     * @param token - origin in source code
     * @param expr - value to store in a local so that we can copy it
     */
    constructor(token: LexerToken, expr: DataExpr) {
        super(token, expr.datatype);
        this.value = expr;
    }

    /**
     * @override
     */
    out(ctx: ModuleManager, fun: FunExpr) {
        // if (!this.value.expensive)
        //     return this.value.out(ctx, fun);

        if (this.locals === null) {
            this.locals = fun.addLocal(this._datatype);
            if (this.locals.length === 1)
                return `${this.value.out(ctx, fun)}\n\t(local.tee ${this.locals[0]})`;
            else
                return  `${this.value.out(ctx, fun)}\n\t${fun.setLocalWat(this.locals)
                    }\n\t${fun.getLocalWat(this.locals)}`;
        }
        return fun.getLocalWat(this.locals);
    }

    // Prevent this from getting re-tee'd
    /**
     * @override
     */
    get expensive(): boolean {
        return false;
    }
    children(): Expr[] {
        return [];
    }
}

/**
 * Similar to InstrExpr but with multi-returns captured into dependent locals
 *
 * @deprecated - this is mostly used like a tee expression
 */
export class MultiInstrExpr extends Expr {
    // WASM instruction mnemonic
    instr: string;

    // Arguments passed
    args: DataExpr[];

    // Resulting values
    results: DependentLocalExpr[];

    constructor(token: LexerToken, instr: string, args: DataExpr[], resultTypes: types.DataType[]) {
        super(token);
        this.instr = instr;
        this.args = args;
        this.results = resultTypes.map(t => new DependentLocalExpr(token, t, this));
    }

    /**
     * @override
     */
    out(ctx: ModuleManager, fun: FunExpr) {
        this._isCompiled = true;

        // Get locals
        this.results.forEach(e => {
            if (!e.datatype.isUnit())
                e.inds = fun.addLocal(e.datatype);
        });

        // Instruction + capture results
        return `(${this.instr} ${
            this.args.map(e => e.out(ctx, fun)).join(' ')
        })\n${
            this.results.map(e => fun.setLocalWat(e.inds)).join(' ')
        }`;
    }

    /**
     * @override
     */
    get expensive(): boolean {
        return true;
    }
    children() {
        return this.args;
    }
}

/**
 * Expression to be used for indentifiers, similar behavior to TeeExpr
 */
export class IdExpr extends DataExpr {
    declare public value: DataExpr;

    /**
     * Should this identifier be stored in a local?
     */
    public stored = false;

    /**
     * Indicies for the locals
     */
    public locals: number[] = null;

    /**
     * @constructor
     * @param token location in code
     * @param expr expression stored by the local
     */
    constructor(token: LexerToken, expr: DataExpr) {
        super(token, expr.datatype);
        this.value = expr;
    }

    // Proxy
    get expensive(): boolean { return this.value.expensive; }
    children(): Expr[] { return [this.value]; }
    getLeaves(): Expr[] { return this.value.getLeaves(); }

    /**
     * Similar to .out except only stores value. Use when storing before use
     * @param ctx Relevant WASM Module context
     * @param fun Relevant Function context
     * @returns
     */
    store(ctx: ModuleManager, fun?: FunExpr): string {
        // Cheap operations don't need caching
        if (!this.expensive)
            return '';
        this.locals = fun.addLocal(this.value.datatype);
        return `${this.value.out(ctx, fun)}\n\t${fun.setLocalWat(this.locals)
            }\n\t${fun.getLocalWat(this.locals)}`;
    }

    /**
     * @override
     */
    out(ctx: ModuleManager, fun?: FunExpr): string {
        // Store expensive exprs in locals, otherwise just get resulting expr
        if (this.stored && this.value.expensive)
            if (!this.locals) {
                // TODO maybe should define locals at top of function instead of at use case
                this.locals = fun.addLocal(this.value.datatype);
                if (this.locals.length === 1)
                    return `${this.value.out(ctx, fun)}\n\t(local.tee ${this.locals[0]})`;
                else
                    return  `${this.value.out(ctx, fun)}\n\t${fun.setLocalWat(this.locals)
                        }\n\t${fun.getLocalWat(this.locals)}`;
            } else {
                return fun.getLocalWat(this.locals);
            }
        else
            return this.value.out(ctx, fun);
    }
}