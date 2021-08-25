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
    _isCompiled: boolean = false;

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
     * @param fun - function export context
     * @returns - wasm translation
     */
    out(ctx: ModuleManager, fun?: FunExportExpr): string {
        return '';
    }

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
};

/**
 * Data Expressions
 * @abstract
 * @class
 */
export abstract class DataExpr extends Expr {
    datatype: types.Type;

    /**
     * @param token - location in code
     * @param datatype - Datatype for value
     */
    constructor(token: LexerToken, datatype: types.Type) {
        super(token);
        this.datatype = datatype;
    }

    static expensive = false;
};

/**
 * For when the output of an expression is stored in a local variable
 *
 * used to handle multi-returns so that they don't get used out of order
 */
 export class DependentLocalExpr extends DataExpr {
    source: Expr;
    index: number;

    constructor(token: LexerToken, datatype: types.Type, source: Expr) {
        super(token, datatype);
        this.source = source;
        this.index = -1;
    }

    out(ctx: ModuleManager, fun: FunExportExpr) {
        // source.out() will update our index to be valid

        return `${
            !this.source._isCompiled ? this.source.out(ctx, fun) : ''
        } ${
            this.datatype.getBaseType().isVoid() ? '' : `(local.get ${this.index})`
        }`;
    }

    children() {
        return this.source.children();
    }
};

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
    _locals: Array<null|types.PrimitiveType>;

    /**
     * @param token - Source location
     * @param name - Export label
     * @param inputTypes - Types for input values
     * @param outputs - Generated exprs for return values
     */
    constructor(token: LexerToken, name: string, inputTypes: types.Type[]) {
        super(token);
        this.name = name;
        this.inputTypes = inputTypes.filter(t => !t.getBaseType().isVoid());
        this._locals = inputTypes.filter(t => !t.getBaseType().isVoid()).map(t => null);
    }

    /**
     * @param type - storage type for local
     * @returns - local index
     */
    addLocal(type: types.Type /*types.PrimitiveType*/): number {
        // TODO when given non-primitive type expand it to a list of primitives
        // new return type will be array
        return this._locals.push(type as types.PrimitiveType) - 1;
    }

    /**
     * Reserve space for value
     * @param type storage type for local
     * @param token source location
     * @returns local indicies
     */
    addLocals(type: types.Type, token: LexerToken | LexerToken[]): number[] {
        try {
            return type.flatPrimitiveList().map(this.addLocal);
        } catch (e) {
            throw e === 'union'
                ? new error.SyntaxError('Invalid union type', token)
                : e;
        }
    }

    // TODO should make apis to help lift nested functions/closures

    out(ctx: ModuleManager) {
        // TODO tuples
        const outs = this.outputs.map(o => o.out(ctx, this));
        const paramTypes = this.inputTypes.map(t => t.getWasmTypeName()).filter(Boolean).join(' ');
        const resultTypes = this.outputs.map(r => r.datatype.getWasmTypeName()).filter(Boolean).join(' ');

        return `(func (export "${this.name}") ${
            paramTypes ? `(param ${paramTypes})` : ''
        } ${
            resultTypes ? `(result ${resultTypes})` : ''
        }\n\t\t${
            this._locals.filter(Boolean).map(l => `(local ${l.getWasmTypeName()})`).join(' ')
        }\n\t${
            outs.join('\n\t')
        })`;
    }
};

/**
 * Function parameters expression
 */
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
    constructor(token: LexerToken, datatype: types.Type, source: FunExportExpr, position: number) {
        super(token, datatype);
        this.source = source;
        this.position = position;
    }

    out(ctx: ModuleManager, fun: FunExportExpr) {
        if (this.datatype.getBaseType().isVoid())
            return '';
        return `(local.get ${this.position})`;
    }
};

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
    out(ctx: ModuleManager, fun: FunExportExpr) {
        const outValue = v => v instanceof value.TupleValue
            ? v.value.map(outValue).join()
            : v.value.toWAST();
        return outValue(this.value);
    }

    children() {
        return [];
    }
};

/**
 * Passes stack arguments to desired WASM instruction
 */
export class InstrExpr extends DataExpr {
    // WASM instruction mnemonic
    instr: string;

    // Arguments passed
    args: DataExpr[];

    constructor(token, datatype, instr, args) {
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
};

/**
 * Used for repeated expressions
 * Normally we'd try to use something like dup but wasm weird
 * First time it's compiled it stores value in a new local
 * After that it just does local.get
 */
 export class TeeExpr extends DataExpr {
    local: null | number = null;

    /**
     * @param token - origin in source code
     * @param expr - value to store in a local so that we can copy it
     */
    constructor(token, expr: DataExpr) {
        super(token, expr.datatype);
        this.value = expr;
    }

    /**
     * @override
     */
    out(ctx: ModuleManager, fun: FunExportExpr) {
        if (this.local === null) {
            this.local = fun.addLocal(this.datatype);
            return `${this.value.out(ctx, fun)}\n\t${
                this.datatype.getBaseType().isVoid() ? '' : `(local.tee ${this.local})`
            }`;
        }
        return this.datatype.getBaseType().isVoid() ? '' : `(local.get ${this.local})`;
    }

    // Prevent this from getting re-tee'd
    static expensive = false;
};

