import * as value from '../value.js';
import * as types from '../datatypes.js';
import * as error from '../error.js';
import { LexerToken } from '../scan.js';
import ModuleManager from '../module.js';
import Context from '../context.js';

// TODO expr constructors should be augmented to also take in Context object
// This way they can also emit warnings

/**
 * This stores expressions that we can reason about
 * but can't completly eliminate from the code.
 *
 * For example, operations on user input and not constant-values
 *
 * @abstract
 * @class
 */
export abstract class Expr extends value.Value {
    // State variable to prevent duplicated compilation
    _isCompiled = false;

    /**
     * @constructor
     * @param token - Source location
     */
    constructor(token: LexerToken) {
        super(token, value.ValueType.Expr, undefined);
    }

    /**
     * Compilation action
     * @virtual
     * @param ctx - compilation context
     * @param fun - function export context
     * @returns - wasm translation
     */
    abstract out(ctx: ModuleManager, fun?: FunExpr): string;

    /**
     * Get all expressions which constitute this one
     * @returns child nodes
     * @virtual
     */
    children(): Expr[] {
        return [];
    }

    /**
     * Would it be better to store the value in a local or inline it multiple times?
     * @returns true if performance would improve with caching false if inlining better
     * @virtual
     */
    get expensive() {
        return true;
    }

    /**
     * Exhaustive version of .children()
     * @returns all child nodes which don't have children
     */
    getLeaves(): Expr[] {
        let ret: Set<Expr> = new Set(this.children());
        let retLen = ret.size;
        do {
            retLen = ret.size;
            // console.log('v', retLen, [...ret][2]);
            ret = [...ret]
                .map(e => {
                    const ret = e.children();

                    // ts-ignore
                    if (ret.some(e => !e.children)) {
                        console.log('no cs', e);
                    }
                    return ret.length === 0 ? e : ret;
                }).reduce((a, v) => {
                    if (v instanceof Array) {
                        v.forEach(e => a.add(e));
                    } else {
                        a.add(v);
                    }
                    return a;
                }, new Set<Expr>());
        } while (retLen != ret.size);

        return [...ret];
    }
}

/**
 * Data Expressions
 * @abstract
 * @class
 */
export abstract class DataExpr extends Expr {
    /**
     * @param token - location in code
     * @param datatype - Datatype for value
     */
    constructor(token: LexerToken, protected _datatype: types.DataType) {
        super(token);
    }

    /**
     * @override
     */
    get expensive(): boolean {
        return false;
    }

    /**
     * @override
     */
    get datatype(): types.DataType {
        return this._datatype;
    }

    /**
     * @override
     */
    set datatype(t: typeof this._datatype) {
        this._datatype = t;
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
        throw new Error('Invalid Intermediate Representation node: ' + this.constructor.name);
    }
}

/**
 * `func` expressions. Compilation contexts
 */
export abstract class FunExpr extends Expr {
    // Exported symbol
    readonly name: string;

    // Parameter types
    readonly inputTypes: types.DataType[];

    // Output expressions
    outputs: Array<DataExpr | value.NumberValue> = [];

    // Locals store primitives or pointers
    _locals: Array<
        types.PrimitiveType
        | types.RefType<types.DataType>
        | types.RefRefType<types.RefType<types.DataType>>> = [];

    // Index of transition between parameters and locals
    nparams: number;

    // Parameter expressions
    readonly params: ParamExpr[];


    /**
     * @param token - Source location
     * @param name - Export label
     * @param inputTypes - Types for input values
     */
    constructor(token: LexerToken, name: string, inputTypes: types.DataType[]) {
        super(token);
        this.name = name;
        this.inputTypes = inputTypes.filter(t =>
            t instanceof types.ClassType
                ? !t.getBaseType().isUnit()
                : t.isUnit());
        this.params = inputTypes.map(t =>
            new ParamExpr(token, t, this, t.isUnit() ? [] : this.addLocal(t)));
        this.nparams = this._locals.length;
    }

    /**
     * Declare a new local variable
     * @param type type of the value to be stored in locals
     * @returns array of locals indicies designated
     */
    addLocal(type: types.DataType): number[] {
        // For references we need to store the address
        if (type instanceof types.RefType)
            return [this._locals.push(types.PrimitiveType.Types.I32) - 1];

        // Add relevant locals
        if (type instanceof types.ClassType)
        type = type.getBaseType();
        if (type instanceof types.TupleType) {
            let i = this._locals.length;
            const prims = type.flatPrimitiveList();
            this._locals.push(...prims);
            return prims.map(() => i++);
        }
        if (type instanceof types.PrimitiveType)
            return [this._locals.push(type) - 1];
        if (type instanceof types.ArrowType)
            return [this._locals.push(types.PrimitiveType.Types.I32) - 1];

        // Can't be stored
        console.error(type, type);
        throw new error.SyntaxError("invalid local type", this.token);
    }

    /**
     * Generate webassembly to capture locals from stack
     * @param indicies local indicies to set
     * @returns webassembly text
     */
    setLocalWat(indicies: number[]): string {
        return indicies.map(ind => `(local.set ${ind})`).reverse().join(' ');
    }

    /**
     * Generate webassembly to push locals onto the stack
     * @param indicies locals to push onto stack
     * @returns webassembly text
     */
    getLocalWat(indicies: number[]): string {
        return indicies.map(ind => `(local.get ${ind})`).join(' ');
    }
}

/**
 * Function Export expression
 */
export class FunExportExpr extends FunExpr {
    // TODO should make apis to help lift nested functions/closures

    out(ctx: ModuleManager): string {
        // TODO tuples
        const outs = this.outputs.map(o => o.out(ctx, this));
        const paramTypes = this._locals.slice(0, this.nparams).map(t => t.getWasmTypeName()).join(' ');
        const resultTypes = this.outputs.map(r => r.datatype.getWasmTypeName()).filter(Boolean).join(' ');

        return `(func $${this.name} ${
            paramTypes ? `(param ${paramTypes})` : ''
        } ${
            resultTypes ? `(result ${resultTypes})` : ''
        }\n\t\t${
            this._locals.filter(Boolean).slice(this.nparams).map(l => `(local ${l.getWasmTypeName()})`).join(' ')
        }\n\t${
            outs.join('\n\t')
        })\n(export "${this.name}" (func $${this.name}))`;
    }
}

/**
 * Function parameters expression
 */
export class ParamExpr extends DataExpr {
    /**
     * Function that this is a parameter of
     */
    source: FunExportExpr;

    /**
     * Indicies for access
     */
    localInds: number[];

    /**
     * @param token - Locaation in code
     * @param datatype - Datatype for expr
     * @param source - Origin expression
     * @param localInds - Stack index (0 == left)
     */
    constructor(token: LexerToken, datatype: types.DataType, source: FunExpr, localInds: number[]) {
        super(token, datatype);
        this.source = source;
        this.localInds = localInds;
    }

    /**
     * @override
     */
    out() {
        return this.source.getLocalWat(this.localInds);
    }
}
