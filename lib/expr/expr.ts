import * as value from '../value.js';
import * as types from '../datatypes.js';
import type { LexerToken } from '../scan.js';
import type ModuleManager from '../module.js';
import type { FunExpr, FunLocalTracker } from './fun.js';
import type { WatCode } from '../wat.js';

// This file defines the abstract base types for expressions

// TODO expr constructors should be augmented to also take in Context object
// This way they can also emit warnings

/**
 * Some values are compatible
 */
export interface Compileable {
    out(ctx: ModuleManager, fun?: FunExpr): WatCode;
    children(): Expr[];
    datatype?: types.DataType;
}

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
    abstract out(ctx: ModuleManager, fun?: FunExpr): WatCode;

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

    
    /**
     * Size of primitve datatype, otherwise assume it's a reference thus sizeof(i32) => 4
     */
    private static primDtSize(t: types.PrimitiveType | types.RefType<any>) {
        if (t instanceof types.PrimitiveType)
            switch (t.name) {
                case 'i32': case 'f32': return 4;
                case 'i64': case 'f64': return 8;
                default: throw new Error('wtf?');
            }
        return 4;
    }

    /**
     * Create the reference bitfield used by garbage collector when tracing
     *
     * See the documentation on linear memory and garbage collection in planning/implementation/lm.md
     *
     * @param dt datatype to add bitfield for
     * @param fpl primitive components for the datatype dt.flatPrimitiveList()
     * @param sizes sizes for the components of the datatype
     * @returns bits constituting the bitfield
     */
    static genGcBitfield(
        dt: types.DataType,
        fpl = dt.flatPrimitiveList(),
        sizes = fpl.map(this.primDtSize),
    ): Uint8Array {
        // Generate bitstring
        const bfStr = fpl.map((t, i) =>
            t instanceof types.PrimitiveType
                ? sizes[i] === 4
                    ? '0' : '00'
                : '1'
        ).join('');

        // Convert bitstring to int8 array
        const ret: number[] = [];
        let i = 0;
        while (i < bfStr.length) {
            let b = 0;
            const ni = i + 7;
            for (; i < ni; i++) {
                if (bfStr[i] === '1')
                    b++;
                b <<= 1;
            }
            ret.push(b);
        }

        return new Uint8Array(ret);
    }

    /**
     * Construct a gc'd object
     * @param ctx compiler context
     * @param fun function containing object construction
     * @returns wat
     */
    protected constructGc(dt: types.DataType, ctx: ModuleManager, fun: FunExpr): string {
        // No reason to allocate object for unit values
        const fpl = dt.flatPrimitiveList();
        if (fpl.length == 0)
            return '(call $__ref_stack_push (i32.const 0))';

        // Get reference to gc'd object
        const fpSizes = fpl.map(Expr.primDtSize).reverse();
        const bf = Expr.genGcBitfield(dt, fpl, fpSizes);
        const bfAddr = ctx.addStaticData(bf, true);
        let ret = `\n\t(call $__alloc (i32.const ${bf.length}) (i32.const ${bfAddr}))`;

        // Store raw gc reference into local
        // NOTE we could probably put it directly into the rv stack and wbbuff
        //      should give similar perf and improve thread safety
        const local = fun.addLocal(types.PrimitiveType.Types.I32)[0];
        ret += local.setLocalWat();
        ret += '\n\t';

        // Copy object into heap
        const locals: { [k: string]: FunLocalTracker[] } = {}; // Recycle locals of same types
        let totalSize = fpSizes.reduce((a, b) => a + b, 0);
        fpl.reverse().forEach((t, i) => {
            // Swap addr with last component of object before using store instruction
            // Webassembly is poorly designed, the addr should be second arg to t.store
            if (t instanceof types.PrimitiveType) {
                // Primitive
                const swapLocal = locals[t.name] || (locals[t.name] = fun.addLocal(t));
                ret += `${fun.setLocalWat(swapLocal)
                    }${local.getLocalWat()
                    }${fun.getLocalWat(swapLocal)
                    }(${t.name}.store offset=${totalSize -= fpSizes[i]})`;
            } else {
                // Use Reference from ref stack
                ret += `${local.getLocalWat()
                }(call $__ref_stack_pop)(i32.store offset=${totalSize -= fpSizes[i]})`;
            }
        });

        // Push gc reference onto ref stack for safety
        ret += `(call $__ref_stack_push ${local.getLocalWat()})`;

        // Free up temporary locals
        ret += fun.removeLocalWat([local].concat(...Object.values(locals)));
        return ret;
    }

    /**
     * Load object pointed to by reference onto the stack
     * @param dt type of value to load
     * @param fun function it's being loaded into
     * @returns wasm text source
     */
    protected loadRef(
        dt: types.RefType<types.DataType>,
        fun: FunExpr,
    ): string {
        const fpl = dt.unpackRefs();

        // Single object
        if (fpl.length <= 1)
            return fpl.map(t => `(${t.type.getWasmTypeName()}.load offset=${t.offsetBytes} (call $__ref_stack_pop))${
                t.type instanceof types.RefType ? '(call $__ref_stack_push)' : '' }`
            ).join(' ');

        // Store pointer into a local for multiple uses
        const ptrLocal = fun.addLocal(types.PrimitiveType.Types.I32);
        return `(call $__ref_stack_pop)${
            fun.setLocalWat(ptrLocal)
        }${
            fpl.map(t =>
                `(${t.type.getWasmTypeName()}.load offset=${t.offsetBytes} ${fun.getLocalWat(ptrLocal)})${
                    t.type instanceof types.RefType ? '(call $__ref_stack_push)' : '' }`
            ).reverse().join(' ')
        }${fun.removeLocalWat(ptrLocal)}`;

        // After this point `ptrLocal` is no longer needed so I could
        // add a `fun.freeLocal()` method which allows it to get used to hold other values
        // not a big deal for primitives since simple optimizers will catch but for
        // references it would definitely pay off
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
     * @param _datatype - Datatype for value
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