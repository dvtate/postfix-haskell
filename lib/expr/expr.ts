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
    abstract children(): Expr[];

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
                    return (!ret || ret.length === 0) ? e : ret;
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
        throw new Error('Invalid Compile-Time only Expr: ' + this.constructor.name);
    }
    children(): Expr[] {
        throw new Error('Invalid Compile-Time only Expr: ' + this.constructor.name);
    }
}

// Methods for storing and accessing locals
// enum FunLocalStorageMethod {
//     Prim,       // primitives via local.set and local.get
//     RVPtr,      // pointers to address on the RV Stack
//     RVOffset,   // offset from rv stack pointer
// }

class FunLocalTracker {
    // static Type = FunLocalStorageMethod;
    // method: FunLocalStorageMethod;

    watTypename: string;

    constructor(
        public fun: FunExpr,
        public datatype: types.PrimitiveType
        | types.RefType<types.DataType>,
        public index: number,
    ) {
        if (datatype instanceof types.PrimitiveType) {
            // Use WASM Locals
            // this.method = FunLocalStorageMethod.Prim;
            fun.locals.push(this);
            this.watTypename = datatype.name;
        } else {
            // Use RV Stack
            // this.method = FunLocalStorageMethod.RVOffset;
            this.watTypename = datatype.type instanceof types.PrimitiveType
                ? datatype.type.name
                : 'i32';
        }
    }

    /**
     *
     * @param getValue if true then we only ask for the
     */
    getLocalWat(getValue = false) {
        // Primitives are easy
        if (this.datatype instanceof types.PrimitiveType)
            return `(local.get ${this.index})`;

        type RDT = types.RefType<types.DataType>;
        if (getValue)
            // Reference
                // Load pointer from RV stack pointer offset
                // Load value from pointer
            return `\n\t(${this.watTypename}.load offset=${
                (this.datatype as RDT).offsetBytes
            } (i32.load offset=${this.index} (global.get $__rv_sp)))${
                // If value is also a reference then we can't keep it on wasm stack
                (this.datatype as RDT).type instanceof types.RefType
                    ? '\n\t call $__ref_stack_push'
                    : ''
            }`;

        if (this.index !== 0)
            return '';

        return `\n\t(call $__ref_stack_push (i32.load offset=${this.index
            } (global.get $__rv_sp)))`;
    }

    setLocalWat(): string {
        if (this.datatype instanceof types.PrimitiveType)
            return `local.set ${this.index}`;

        type RDT = types.RefType<types.DataType>;
        const isRefMember = this.datatype.type instanceof types.RefType;

        return this.datatype.offsetBytes === 0
                ? `(i32.store offset=${this.index} (global.get $__rv_sp) (call $__ref_stack_pop))`
                : '';

        // if (!this.fun._i32Reg)
        //     this.fun._i32Reg = new FunLocalTracker(
        //         this.fun,
        //         types.PrimitiveType.Types.I32,
        //         this.fun.locals.length,
        //     );

        // // *((__rv_sp[index] = __ref_stack_pop()) + offset) = ____
        // return `
        //     ${ // Move pointer to rv stack
        //         this.datatype.offsetBytes === 0
        //         ? `(i32.store offset=${this.index} (global.get $__rv_sp) (call $__ref_stack_pop))`
        //         : ''
        //     }
        //     ;; move ptr to rv store
        //     global.get $__rv_sp
        //     call $__ref_stack_pop
        //     i32.store offset=${this.index}

        //     ;; Copy ptr back onto stack
        //     global.get $__rv_sp
        //     i32.load offset=${this.index}

        //     ${ isRefMember ? 'call $__ref_stack_pop' : ''}
        //     ;;
        // `
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
    locals: Array<FunLocalTracker> = [];

    // Index of transition between parameters and locals
    nparams: number;

    // Space to allocate on the RV stack for this function
    rvStackOffset: number;

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
            new ParamExpr(token, t, this, t.isUnit() ? [] : this.addLocal(t).map(l => l.index)));
        this.nparams = this.locals.length;
    }

    /**
     * Locals and stack stuff
     * @param body original body
     * @returns wrapped body
     */
    protected wrapBody(body: string): string {
        return `\n\t(local ${
            this.locals.map(l => l.watTypename).join(' ')
        })\n\t(global.set $__rv_sp (i32.sub (global.get $__rv_sp) (i32.const ${this.rvStackOffset})))${
            body
        }\n\t(global.set $__rv_sp (i32.add (global.get $__rv_sp) (i32.const ${this.rvStackOffset})))`;
    }

    /**
     * Declare a new local variable
     * @param type type of the value to be stored in locals
     * @returns array of locals indicies designated
     */
    addLocal(type: types.DataType): FunLocalTracker[] {
        // Drop classes
        if (type instanceof types.ClassType)
            type = type.getBaseType();

        // Potentially packed values
        if (type instanceof types.TupleType)
            return type.flatPrimitiveList().map(p =>
                new FunLocalTracker(this, p, this.locals.length));

        // Referenced values
        if (type instanceof types.RefType) {
            const ret = type.flatPrimitiveList().map(p =>
                new FunLocalTracker(this, p, this.rvStackOffset));
            this.rvStackOffset += 4;
            return ret;
        }

        if (type instanceof types.PrimitiveType)
            return [new FunLocalTracker(this, type, this.locals.length)];

        // if (type instanceof types.ArrowType)
        //     return [this.locals.push(types.PrimitiveType.Types.I32) - 1];

        // Can't be stored
        console.error(type, type);
        throw new error.SyntaxError("invalid local type", this.token);
    }

    /**
     * Generate webassembly to capture locals from stack
     * @param locals local trackers for locals to set
     * @param args @depricated passed tracker method
     * @returns webassembly text
     */
    setLocalWat(locals: FunLocalTracker[], ...args: any[]): string {
        return locals.map(l => l.getLocalWat(...args)).reverse().join(' ');
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
        const paramTypes = this.locals.slice(0, this.nparams).map(t => t.datatype.getWasmTypeName()).join(' ');
        const resultTypes = this.outputs.map(r => r.datatype.getWasmTypeName()).filter(Boolean).join(' ');

        return `(func $${this.name} ${
            paramTypes ? `(param ${paramTypes})` : ''
        } ${
            resultTypes ? `(result ${resultTypes})` : ''
        } ${
            this.wrapBody(outs.join('\n\t'))
        })\n(export "${this.name}" (func $${this.name}))`;
    }

    children(): Expr[] {
        throw new Error('Invalid call to ' + this.constructor.name + '.children()');
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
    children(): Expr[] {
        return [];
    }

    /**
     * @override
     */
    out() {
        return this.source.getLocalWat(this.localInds);
    }
}
