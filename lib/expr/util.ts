import { LexerToken } from '../scan.js';
import * as error from '../error.js';
import * as value from '../value.js';
import * as types from '../datatypes.js';
import { Expr, DataExpr } from './expr.js';
import type ModuleManager from '../module.js';
import Context from '../context.js';
import { EnumValue } from '../enum.js';
import { FunExpr, FunLocalTracker, FunLocalTrackerStored, InternalFunExpr } from './func.js';
import { loadRef } from './gc_util.js';

/**
 * Flatten a list of mixed values+expressions into a single list of expressions
 * @param vs array of values
 * @returns array of expressions
 */
export function fromDataValue(vs: Array<DataExpr | value.Value>, ctx?: Context): DataExpr[] {
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
            return v.toExpr();

        // If a macro gets here it's because it should be a rt closure
        if (v.type === value.ValueType.Macro)
            console.error('Invalid RT Macro');

        throw new error.TypeError('Incompatible value', [v.token], [v], null);
    }).reduce(
        (a: DataExpr[], v: DataExpr | DataExpr[]) =>
            v instanceof Array ? a.concat(v) : (a.push(v), a),
        [],
    );
}

// Provide default implementation of .out for values
// TODO this is ghetto... fuck ESM
// TODO this should go in Value class
value.Value.prototype.out = function (ctx: ModuleManager, fun?: FunExpr): string {
    return fromDataValue([this]).map(e => e.out(ctx, fun)).join(' ');
};


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
        return this.value.value.toWAST();
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
 * For when the output of an expression is stored in a local variable
 *
 * used to handle multi-returns so that they don't get used out of order
 * 
 * `source` expr stores its results in locals, this expr acts as a proxy for those locals
 * so that they can be treated like normal expressions
 */
export class DependentLocalExpr extends DataExpr {
    // Expression produces the output captured by this one
    source: Expr;

    // Local variable index to which this value is stored
    private _inds: FunLocalTracker[] = null;

    declare value: value.TupleValue | null;

    constructor(
        token: LexerToken, 
        datatype: types.DataType, 
        source: Expr,
        // private unpackParent: DependentLocalExpr = null,
    ) {
        super(token, datatype);
        this.source = source;
        if (datatype instanceof types.ClassType)
            datatype = datatype.getBaseType();
        if (datatype instanceof types.TupleType) {
            this.value = new value.TupleValue(
                token,
                datatype.types.map(t => 
                    new DependentLocalExpr(
                        token,
                        t as types.DataType,
                        this.source,
                        // unpackParent || this
                    )
                ), 
                datatype,
            );
        }
    }

    set inds(inds: FunLocalTracker[]) {
        if (this.value && this.value.value.length) {
            // Recursively apply indicies to fields
            // TODO this is a hack... should have dedicated static function
            inds = inds.slice();
            const f = new InternalFunExpr(null, '', this.value.value.map(v => v.datatype as types.DataType));
            f.params.forEach((p, i) =>
                (this.value.value[i] as DependentLocalExpr).inds = inds.splice(0, p.inds.length)
            );
        } else {
            this._inds = inds;
        }
    }

    get inds() {
        return this.getInds();
    }

    getInds(): FunLocalTracker[] {
        if (!this.value)
            return this._inds;
        if (this.value.value.every(Boolean)) {
            const ret = [].concat(...this.value.value.map(v => 
                (v as DependentLocalExpr).getInds()));
            if (ret.every(Boolean))
                return ret;
        }
        return null;
    }

    setInds(fun: FunExpr) {
        if (this.value)
            this.value.value.forEach(v =>
                (v as DependentLocalExpr).setInds(fun));
        else
            this._inds = fun.addLocal(this._datatype);
    }

    /**
     * Store into locals
     * @param ctx
     * @param fun
     * @returns WAT
     */
    capture(ctx: ModuleManager, fun: FunExpr) {
        // if (this.index)
        //     return '';
        this.inds = fun.addLocal(this.value.datatype);
        return `${this.value.out(ctx, fun)}\n${fun.setLocalWat(this.inds)}`;
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

    children(): Expr[] {
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
        // See implementation for seq in standard library
        if (this.instr.length !== 0 && !this.instr.startsWith('('))
            return `${this.args.map(e => e.out(ctx, fun)).join(' ')}(${this.instr})`;
        else
            return this.args.map(e => e.out(ctx, fun)).join('\n\t') + this.instr;
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
    inds: FunLocalTracker[] = null;
    isFinalized = false;

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
        // TODO why is this commented out??
        // if (!this.value.expensive)
        //     return this.value.out(ctx, fun);

        if (this.inds === null) {
            this.inds = fun.addLocal(this._datatype);
            if (this.inds.length === 1
                && this.inds[0].datatype instanceof types.PrimitiveType
                && this.inds[0] instanceof FunLocalTrackerStored)
                return `${this.value.out(ctx, fun)}\n\t(local.tee ${this.inds[0].index})`;
            else
                return  `${this.value.out(ctx, fun)}\n\t${fun.setLocalWat(this.inds)
                    }\n\t${fun.getLocalWat(this.inds)}`;
        }
        return fun.getLocalWat(this.inds);
    }

    finalize(ctx: ModuleManager, fun: FunExpr) {
        this.isFinalized = true;
        return fun.removeLocalWat(this.inds);
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
                e.setInds(fun);
        });

        // Instruction + capture results
        if (this.instr.length !== 0 && !this.instr.startsWith('('))
            return `${
                this.args.map(e => e.out(ctx, fun)).join(' ')
            }\n\t(${this.instr})\n\t${
                this.results.map(e => fun.setLocalWat(e.getInds())).join(' ')
            }`;
        else
            return `${
                this.args.map(e => e.out(ctx, fun)).join(' ')
            }\n\t${this.instr}\n\t${
                this.results.map(e => fun.setLocalWat(e.getInds())).join(' ')
            }`;
    }

    /**
     * @override
     */
    get expensive(): boolean {
        return !this._isCompiled;
    }
    children() {
        return this.args;
    }
}

/**
 * This expression is only used for macro type inference and thus cannot be compiled
 */
export class DummyDataExpr extends DataExpr {
    /**
     * Create a dummy expression to represent an unknown value of this type.
     * @note behavior with tuples
     * @param token location in code
     * @param datatype result type
     * @returns Expression or tuple of expressions with given datatype
     */
    static create(token: LexerToken, datatype: types.Type): value.TupleValue | DummyDataExpr {
        const baseType = datatype instanceof types.ClassType ? datatype.getBaseType() : datatype;
        if (baseType instanceof types.TupleType && baseType.types.length !== 0)
            return new value.TupleValue(
                token,
                baseType.types.map(t => DummyDataExpr.create(token, t)),
                datatype as types.TupleType,
            );
        return new DummyDataExpr(token, datatype as types.DataType);
    }

    invoke(token: LexerToken, ctx: Context): void | error.SyntaxError {
        // Callable
        if (this._datatype instanceof types.ArrowType) {
            // Don't allow incomlete
            if (!this._datatype.outputTypes)
                return new error.SyntaxError('Cannot invoke incomplete Arrow type', [token, this.token, this._datatype.token], ctx);

            // Check inputs
            const nInputs = this._datatype.inputTypes.length;
            const v = this._datatype.checkInputs(ctx.stack);
            if (!v)
                return new error.TypeError(
                    'Invoke with wrong types',
                    [token, this.token, this._datatype.token],
                    ctx.stack.slice(-nInputs),
                    this._datatype.inputTypes,
                    ctx,
                );

            // Update stack
            ctx.popn(nInputs);
            ctx.push(...this._datatype.outputTypes.map(t => DummyDataExpr.create(token, t)));
            return;
        }

        // Not callable
        if ([value.ValueType.Macro, value.ValueType.Fxn].includes(this._datatype.valueType))
            return new error.SyntaxError(
                `Cannot call expression of syntax type ${value.ValueType[this._datatype.valueType]}`,
                [token, this.token, this._datatype.token],
                ctx,
            );

        // String
        if (this._datatype.valueType === value.ValueType.Str) {
            ctx.push(
                DummyDataExpr.create(token, types.PrimitiveType.Types.I32),
                DummyDataExpr.create(token, types.PrimitiveType.Types.I32),
            );
            return;
        }

        // Simply push it onto the stack
        ctx.push(this);
    }

    /**
     * @override
     */
    out(): string {
        throw new Error('Invalid Compile-Time only Expr: ' + this.constructor.name);
    }
    children(): Expr[] {
        throw new Error('Invalid Compile-Time only Expr: ' + this.constructor.name);
    }
}


export class UnpackExpr extends Expr {
    results: DependentLocalExpr[];
    refType?: types.RefType<any> = null;

    constructor(
        token: LexerToken,
        public expr: DataExpr | value.Value,
        ctx: Context,
    ) {
        super(token);
        let dt = expr.datatype;
        if (dt instanceof types.ClassType)
            dt = dt.getBaseType();

        let memberTypes: types.DataType[];
        if (dt instanceof types.RefType) {
            this.refType = dt;
            memberTypes = dt.unpackRefs();
        } else if (dt instanceof types.TupleType) {
            memberTypes = dt.types as types.DataType[];
        } else {
            throw new error.TypeError('Expected a tuple type to unpack', token, [expr], [new types.TupleType(null)], ctx );
        }

        this.results = memberTypes.map(t => new DependentLocalExpr(token, t, this));
    }
    out(ctx: ModuleManager, fun: FunExpr): string {
        this._isCompiled = true;
        console.warn("Unpacking runtime tuple");
        if (this.refType)
            return loadRef(this.refType, fun);
        else
            return this.expr.out(ctx, fun);
    }
    children(): Expr[] {
        return [];
    }
}