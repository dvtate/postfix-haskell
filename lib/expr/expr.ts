import * as value from '../value';
import * as types from '../datatypes';
import * as error from '../error';
import { LexerToken } from '../scan';
import ModuleManager from '../module';

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
    abstract out(ctx: ModuleManager, fun?: FunExportExpr): string;

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
     * @virtual
     */
    static expensive = true;

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
    constructor(token: LexerToken, public datatype: types.Type) {
        super(token);
    }

    static expensive = false;
}

/**
 * This expression is only used for type inference and thus cannot be compiled
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
        const bt = datatype.getBaseType();
        if (bt instanceof types.TupleType && bt.types.length !== 0)
            return new value.TupleValue(
                token,
                bt.types.map(t => DummyDataExpr.create(token, t)),
                datatype as types.TupleType,
            );
        else
            return new DummyDataExpr(token, datatype);
    }

    /**
     * @override
     */
    out() {
        throw new Error('Invalid Intermediate Representation node: ' + this.constructor.name);
        return '';
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

    constructor(token: LexerToken, datatype: types.Type, source: Expr) {
        super(token, datatype);
        this.source = source;
    }

    out(ctx: ModuleManager, fun: FunExportExpr) {
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
 * Function Export expression
 */
export class FunExportExpr extends Expr {
    // Exported symbol
    name: string;

    // Parameter types
    inputTypes: types.Type[];

    // Output expressions
    outputs: Array<DataExpr | value.NumberValue> = [];

    // Locals
    _locals: Array<types.PrimitiveType>;

    /**
     * @param token - Source location
     * @param name - Export label
     * @param inputTypes - Types for input values
     * @param outputs - Generated exprs for return values
     */
    constructor(token: LexerToken, name: string, inputTypes: types.Type[]) {
        super(token);
        this.name = name;
        this.inputTypes = inputTypes.filter(t => !t.getBaseType().isUnit());
        this._locals = inputTypes.filter(t => !t.getBaseType().isUnit()).map(() => null);
    }

    /**
     * Declare a new local variable
     * @param type type of the value to be stored in locals
     * @returns array of locals indicies designated
     */
    addLocal(type: types.Type): number[] {
        // For references we need to store the address
        if (type instanceof types.RefType)
            return [this._locals.push(types.PrimitiveType.Types.I32) - 1];

        // Add relevant locals
        const baseType = type.getBaseType();
        if (baseType instanceof types.TupleType) {
            let i = this._locals.length;
            const prims = baseType.flatPrimitiveList();
            this._locals.push(...prims);
            return prims.map(() => i++);
        }
        if (baseType instanceof types.PrimitiveType)
            return [this._locals.push(baseType) - 1];

        // Can't be stored
        if (baseType.isWild() || baseType instanceof types.UnionType || baseType instanceof types.ArrowType) {
            console.error(type, baseType);
            throw new error.SyntaxError("invalid local type", this.token);
        }
        console.error(type, baseType);
        throw new error.SyntaxError("WTF??: invalid local type", this.token);
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

    // TODO should make apis to help lift nested functions/closures

    out(ctx: ModuleManager) {
        // TODO tuples
        const outs = this.outputs.map(o => o.out(ctx, this));
        const paramTypes = this.inputTypes.map(t => t.getWasmTypeName()).filter(Boolean).join(' ');
        const resultTypes = this.outputs.map(r => r.datatype.getWasmTypeName()).filter(Boolean).join(' ');

        return `(func $${this.name} ${
            paramTypes ? `(param ${paramTypes})` : ''
        } ${
            resultTypes ? `(result ${resultTypes})` : ''
        }\n\t\t${
            this._locals.filter(Boolean).map(l => `(local ${l.getWasmTypeName()})`).join(' ')
        }\n\t${
            outs.join('\n\t')
        })\n(export "${this.name}" (func $${this.name}))`;
    }
}

/**
 * Function parameters expression
 */
// TODO there should be distinct version of this for handling non-primitive types
export class ParamExpr extends DataExpr {
    // Origin FuncExportExpr
    source: FunExportExpr;

    // Parameter Index
    position: number;

    /**
     * @param token - Locaation in code
     * @param datatype - Datatype for expr
     * @param source - Origin expression
     * @param position - Stack index (0 == left)
     */
    constructor(token: LexerToken, datatype: types.PrimitiveType | types.UnitType, source: FunExportExpr, position: number) {
        super(token, datatype);
        this.source = source;
        this.position = position;
    }

    /**
     * @override
     */
    out() {
        if (this.datatype.getBaseType().isUnit())
            return '';
        return `(local.get ${this.position})`;
    }
}

/**
 * Constant value that we're treating as an Expr
 */
export class NumberExpr extends DataExpr {
    value: value.NumberValue;

    /**
     * @param token - Location in code
     * @param value - Value to wrap
     */
    constructor(token: LexerToken, value: value.NumberValue) {
        super(token, value.datatype);
        this.value = value;
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
}

/**
 * Passes stack arguments to desired WASM instruction
 */
export class InstrExpr extends DataExpr {
    // WASM instruction mnemonic
    instr: string;

    // Arguments passed
    args: DataExpr[];

    constructor(token: LexerToken, datatype: types.Type, instr: string, args: DataExpr[]) {
        super(token, datatype);
        this.instr = instr;
        this.args = args;
    }

    /**
     * @override
     */
    out(ctx: ModuleManager, fun: FunExportExpr) {
        return `(${this.instr} ${this.args.map(e => e.out(ctx, fun)).join(' ')})`;
    }

    static expensive = true;

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
    out(ctx: ModuleManager, fun: FunExportExpr) {
        if (this.locals === null) {
            this.locals = fun.addLocal(this.datatype);
            if (this.locals.length === 1)
                return `${this.value.out(ctx, fun)}\n\t(local.tee ${this.locals[0]})`;
            else
                return '\n\t' + fun.setLocalWat(this.locals)
                    + '\n\t' + fun.getLocalWat(this.locals);
        }
        return fun.getLocalWat(this.locals);
    }

    // Prevent this from getting re-tee'd
    static expensive = false;
}

/**
 * Flatten a list of mixed values+expressions into a single list of expressions
 * @param vs array of values
 * @returns array of expressions
 */
export function fromDataValue(vs: Array<DataExpr | value.Value>): DataExpr[] {
    return vs.map(v => {
        // Already an expression
        if (v instanceof DataExpr)
            return v;

        // Wrap numbers
        if (v instanceof value.NumberValue)
            return new NumberExpr(v.token, v);

        // Recursively wrap tuple members
        if (v instanceof value.TupleValue)
            return fromDataValue(v.value);

        // If a macro gets here it's because it should be a rt closure

        // Eww runtime error...
        throw new error.TypeError("incompatible type", v.token, v, null);
    }).reduce(
        (a: DataExpr[], v: DataExpr | DataExpr[]) =>
            v instanceof Array ? a.concat(v) : (a.push(v), a),
        [],
    );
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

    constructor(token: LexerToken, instr: string, args: DataExpr[], resultTypes: types.Type[]) {
        super(token);
        this.instr = instr;
        this.args = args;
        this.results = resultTypes.map(t => new DependentLocalExpr(token, t, this));
    }

    /**
     * @override
     */
    out(ctx: ModuleManager, fun: FunExportExpr) {
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

    static expensive = true;

    children() {
        return this.args;
    }
}