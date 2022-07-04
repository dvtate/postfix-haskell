import * as types from '../datatypes.js';
import type ModuleManager from '../module.js';
import type { DataExpr } from './expr.js';
import type { FunExpr, FunLocalTracker } from './fun.js';


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
 *
 * @param dt
 * @param fpl
 * @param sizes
 * @returns
 */
export function genGcBitfield(
    dt: types.DataType,
    fpl = dt.flatPrimitiveList(),
    sizes = fpl.map(primDtSize),
): Uint8Array {
    // Generate bitstring
    const bfStr = fpl.map((t, i) =>
        t instanceof types.PrimitiveType
            ? sizes[i] === 4
                ? '0' : '00'
            : '1').join('');

    // Converty bitstring to int8 array
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
 * @param e expression for object
 * @param ctx compiler context
 * @param fun function containing object construction
 * @returns wat
 */
export function constructGc(dt: types.DataType, ctx: ModuleManager, fun: FunExpr): string {
    // Get reference to gc'd object
    const fpl = dt.flatPrimitiveList();
    const fpSizes = fpl.map(primDtSize);
    const bf = genGcBitfield(dt, fpl, fpSizes);
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
        // Webassembly is poorly designed, the addr should be scond arg to t.store
        // TODO OPTIMIZE instead use a local because calling a helper function like this is slow
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
    return ret;
}

export function loadRef(
    dt: types.RefType<types.DataType>,
    fun: FunExpr
): string {
    const fpl = dt.flatPrimitiveList();

    const ptrLocal = fun.addLocal(types.PrimitiveType.Types.I32);
    let ret = fun.setLocalWat(ptrLocal);

    ret += fpl.map(t =>
        `(${t.getWasmTypeName()}.load offset=${t.offsetBytes} ${fun.getLocalWat(ptrLocal)})`
    ).join(' ');

    return ret;
}