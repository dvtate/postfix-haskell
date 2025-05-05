import * as types from '../datatypes.js';
import type ModuleManager from '../module.js';
import type { FunExpr, FunLocalTracker } from './func.js';

/**
 * Size of primitve datatype, otherwise assume it's a reference thus sizeof(i32) => 4
 */
 function primDtSize(t: types.PrimitiveType | types.RefType<any>) {
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
export function genGcBitfield(
    dt: types.DataType,
    fpl = dt.flatPrimitiveList(),
    sizes = fpl.map(primDtSize),
): Uint8Array {
    // Generate bitstring
    let bfStr = fpl.map((t, i) =>
        t instanceof types.PrimitiveType
            ? sizes[i] === 4
                ? '0' : '00'
            : '1' // pointers always i32
    ).join('');

    // Pad the bitstring with trailing zeros to make the length a multiple of 8
    if (bfStr.length % 8 !== 0) {
        const paddingLength = 8 - (bfStr.length % 8);
        bfStr = bfStr.padEnd(bfStr.length + paddingLength, '0');
    }

    // Convert to Uint8Array
    const ret = new Uint8Array(bfStr.length / 8);
    for (let i = 0; i < bfStr.length; i += 8) {
        const byteString = bfStr.slice(i, i + 8);
        ret[i] = parseInt(byteString, 2);
    }
    return ret;
}

/**
 * Construct a gc'd object
 * @param ctx compiler context
 * @param fun function containing object construction
 * @returns wat
 */
export function constructGc(dt: types.DataType, ctx: ModuleManager, fun: FunExpr): string {
    // No reason to allocate object for unit values
    const fpl = dt.flatPrimitiveList();
    if (fpl.length == 0)
        return '\n\t(call $__ref_stack_push (i32.const 0))';

    // Get reference to gc'd object
    const fpSizes = fpl.map(primDtSize);
    let totalSize = fpSizes.reduce((a, b) => a + b, 0);
    const bf = genGcBitfield(dt, fpl, fpSizes);
    const bfAddr = ctx.addStaticData(bf, true);
    let ret = `\n\t(call $__alloc (i32.const ${totalSize / 4}) (i32.const ${bfAddr}))`;

    // Store raw gc reference into local
    // NOTE we could probably put it directly into the rv stack and wbbuff
    //      should give similar perf and improve thread safety
    const local = fun.addLocal(types.PrimitiveType.Types.I32)[0];
    ret += local.setLocalWat();
    ret += '\n\t';

    // Copy object into heap
    const locals: { [k: string]: FunLocalTracker[] } = {}; // Recycle locals of same types
    fpSizes.reverse();
    fpl.reverse().forEach((t, i) => {
        // Swap addr with last component of object before using store instruction
        // Webassembly is poorly designed, the addr should be second arg to t.store
        if (t instanceof types.PrimitiveType) {
            // Primitive
            const swapLocal = locals[t.name] || (locals[t.name] = fun.addLocal(t));
            ret += `${fun.setLocalWat(swapLocal)
                }${local.getLocalWat()
                }${fun.getLocalWat(swapLocal)
                }(${t.name}.store offset=${totalSize -= fpSizes[i]})\n\t`;
        } else {
            // Use Reference from ref stack
            ret += `${local.getLocalWat()
            }(call $__ref_stack_pop)(i32.store offset=${totalSize -= fpSizes[i]})\n\t`;
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
export function loadRef(
    dt: types.RefType<types.DataType>,
    fun: FunExpr,
): string {
    const fpl = dt.unpackRefs();

    // Single object
    if (fpl.length <= 1)
        return fpl.map(t => `(${t.type.getWasmTypeName()}.load offset=${t.offsetBytes} (call $__ref_stack_pop))${
            t.type instanceof types.RefType ? '(call $__ref_stack_push)' : '' }\n\t`
        ).join(' ');

    // Store pointer into a local for multiple uses
    const ptrLocal = fun.addLocal(types.PrimitiveType.Types.I32);
    return `(call $__ref_stack_pop)${
        fun.setLocalWat(ptrLocal)
    }${
        fpl.map(t =>
            `(${t.type.getWasmTypeName()}.load offset=${t.offsetBytes} ${fun.getLocalWat(ptrLocal)})${
                t.type instanceof types.RefType ? '(call $__ref_stack_push)' : '' }\n\t`
        ).reverse().join(' ')
    }${fun.removeLocalWat(ptrLocal)}`;
}