import * as types from '../datatypes.js';
import type ModuleManager from '../module.js';
import type { DataExpr } from './expr.js';
import type { FunExpr } from './fun.js';


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


// Construct gc'd value
export function constructGc(e: DataExpr, ctx: ModuleManager, fun: FunExpr): string {
    // Build object onto the stack
    let ret = e.out(ctx, fun);

    // Get reference to gc'd object
    const dt = e.datatype;
    const fpl = e.datatype.flatPrimitiveList();
    const fpSizes = fpl.map(primDtSize);
    const bf = genGcBitfield(e.datatype, fpl, fpSizes);
    const bfAddr = ctx.addStaticData(bf, true);
    ret += `\n\t(call $__alloc (i32.const ${bf.length}) (i32.const ${bfAddr}))`;

    // Store raw gc reference into local
    // NOTE we could probably put it directly into the ref stack and wbbuff
    //      should give similar perf and improve thread safety
    const local = fun.addLocal(types.PrimitiveType.Types.I32)[0];
    ret += local.setLocalWat();
    ret += '\n\t';

    // Copy object into heap
    let totalSize = fpSizes.reduce((a, b) => a + b, 0);
    fpl.reverse().forEach((t, i) => {
        // Add relevant helper
        const tName = t instanceof types.PrimitiveType ? t.name : 'i32';
        const helperName = `__swap_${tName}_i32`;
        ctx.addHelper(helperName);

        // Swap addr with last component of object before using store instruction
        // Webassembly is poorly designed, the addr should be scond arg to t.store
        ret += local.getLocalWat();
        ret += `(call $${helperName})`;
        const offset = (totalSize -= fpSizes[i]);
        ret += `(${tName}.store offset=${offset})`;
    });

    // Push gc reference onto ref stack for safety
    ret += `(call $__ref_stack_push ${local.getLocalWat()})`;
    return ret;
}
