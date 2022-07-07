import * as types from '../datatypes.js';
import * as value from '../value.js';
import * as error from '../error.js';
import type ModuleManager from '../module.js';
import { LexerToken } from '../scan.js';
import { Expr, DataExpr } from './expr.js';


// Methods for storing and accessing locals
// enum FunLocalStorageMethod {
//     Prim,       // primitives via local.set and local.get
//     RVPtr,      // pointers to address on the RV Stack
//     RVOffset,   // offset from rv stack pointer
// }


export abstract class FunLocalTracker {
    // static Type = FunLocalStorageMethod;
    // method: FunLocalStorageMethod;

    watTypename: string;

    constructor(
        public fun: FunExpr,
        public datatype: types.PrimitiveType | types.RefType<types.DataType>,
    ) {
    }

    abstract getLocalWat(getValue?: boolean): string;
    abstract setLocalWat(): string;
}

export class FunLocalTrackerStored extends FunLocalTracker {
    constructor(
        fun: FunExpr,
        datatype: types.PrimitiveType | types.RefType<types.DataType>,
        public index: number,
    ) {
        super(fun, datatype);
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
     * Generate wat to load this local's value onto stack
     * @param getValue if true we load only this part of the referenced value instead of just loading a pointer
     * @returns WASM Text source code
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

    /**
     * Generate wat to store this value into a local
     * @returns WASM Text source code
     */
    setLocalWat(): string {
        if (this.datatype instanceof types.PrimitiveType)
            return `(local.set ${this.index})`;

        return this.datatype.offsetBytes === 0
            ? `(i32.store offset=${this.index} (global.get $__rv_sp) (call $__ref_stack_pop))`
            : '';


        // type RDT = types.RefType<types.DataType>;
        // const isRefMember = this.datatype.type instanceof types.RefType;

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

export class FunLocalTrackerConstexpr extends FunLocalTracker {
    constructor(
        fun: FunExpr,
        datatype: types.PrimitiveType,
        public wat: string,
    ) {
        super(fun, datatype);
        this.watTypename = wat.slice(1, 4);
    }

    getLocalWat(): string {
        return this.wat;
    }
    setLocalWat(): string {
        return '(drop)';
    }
}

/**
 * `(func ... )` expressions. Compilation contexts
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
    rvStackOffset = 0;

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
        this.nparams = this.locals.length;
    }

    /**
     * Locals and stack stuff
     * @param body original body
     * @returns wrapped body
     */
    protected wrapBody(body: string): string {
        return `\n\t(local ${
            this.locals.slice(this.nparams).map(l => l.watTypename).join(' ')
        })\n\t${ this.rvStackOffset
            ? `(global.set $__rv_sp (i32.sub (global.get $__rv_sp) (i32.const ${this.rvStackOffset})))`
            : ''
        }${
            body
        }\n\t${ this.rvStackOffset
            ? `(global.set $__rv_sp (i32.add (global.get $__rv_sp) (i32.const ${this.rvStackOffset})))`
            : ''
        }`;
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
                new FunLocalTrackerStored(this, p, this.locals.length));

        // Referenced values
        if (type instanceof types.RefType) {
            const ret = type.flatPrimitiveList().map(p =>
                new FunLocalTrackerStored(this, p, this.rvStackOffset));
            this.rvStackOffset += 4;
            return ret;
        }

        // Unknown enum type
        if (type instanceof types.EnumBaseType || type instanceof types.EnumClassType) {
            const ret = [
                new FunLocalTrackerStored(this, types.PrimitiveType.Types.I32, this.locals.length),
                new FunLocalTrackerStored(this, new types.RefType(type.token, types.PrimitiveType.Types.I32), this.rvStackOffset),
            ];
            this.rvStackOffset += 4;
            return ret;
        }
        // Known enum type
        if (type instanceof types.EnumClassType) {
            const ret = [
                new FunLocalTrackerConstexpr(this, types.PrimitiveType.Types.I32, `(i32.const ${type.index})`),
                new FunLocalTrackerStored(this, new types.RefType(type.token, types.PrimitiveType.Types.I32), this.rvStackOffset),
            ];
            this.rvStackOffset += 4;
            return ret;
        }

        if (type instanceof types.PrimitiveType)
            return [new FunLocalTrackerStored(this, type, this.locals.length)];

        // if (type instanceof types.ArrowType)
        //     return [this.locals.push(types.PrimitiveType.Types.I32) - 1];

        // Can't be stored
        console.error(type, type);
        throw new error.SyntaxError("invalid local type", this.token);
    }

    /**
     * Generate webassembly to capture locals from stack
     * @param locals local trackers for locals to set
     * @returns webassembly text
     */
    setLocalWat(locals: FunLocalTracker[]): string {
        return locals.map(l => l.setLocalWat()).reverse().join(' ');
    }

    /**
     * Generate webassembly to push locals onto the stack
     * @param locals locals to push onto stack
     * @param args @depricated passed tracker method
     * @returns webassembly text
     */
    getLocalWat(locals: FunLocalTracker[], ...args: any[]): string {
        return locals.map(l => l.getLocalWat(...args)).reverse().join(' ');
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
    localInds: FunLocalTracker[];

    /**
     * @param token - Locaation in code
     * @param datatype - Datatype for expr
     * @param source - Origin expression
     * @param localInds - Stack index (0 == left)
     */
    constructor(token: LexerToken, datatype: types.DataType, source: FunExpr, localInds: FunLocalTracker[]) {
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
