import { LexerToken } from './scan';
import Context from './context';
import * as types from './datatypes'
import * as expr from './expr';
import * as value from './value';
import WasmNumber from './numbers';

// Describes an instruction
interface AssemblyDBEntry {
    // Mnemonic for the instruction
    symbol: string;

    // Arguement types taken by the instruction
    param: types.PrimitiveType[];

    // Result types given by instruction
    result: types.PrimitiveType[];

    // Compile-time reduction of constant expressions
    handler?: (ctx: Context, args: WasmNumber[], instr: string) => WasmNumber[] | Error;
}

//
type WasmNumberKeys = {
    [Key in keyof WasmNumber]: Extract<WasmNumber[Key], (..._: WasmNumber[]) => WasmNumber>;
};

interface BMathOptions {
    noInts?: boolean;
    signed?: boolean;
    noFloats?: boolean;
}

function binaryMath(
    name: keyof WasmNumberKeys,
    options: BMathOptions = {},

    // Type agnostic handler
    handler = (ctx: Context, args: WasmNumber[]): WasmNumber[] | Error =>
        [(args[0].clone()[name] as any)(...args.slice(1))]
): AssemblyDBEntry[] {

    // Versions for each type
    return [
        ...(options.noInts ? [] : [{
            // TODO unsigned
            symbol: `i32.${name}${options.signed ? '_u' : ''}`,
            param: [types.PrimitiveType.Types.I32, types.PrimitiveType.Types.I32],
            result: [types.PrimitiveType.Types.I32],
            handler,
        }, {
            symbol: `i64.${name}${options.signed ? '_u' : ''}`,
            param: [types.PrimitiveType.Types.I64, types.PrimitiveType.Types.I64],
            result: [types.PrimitiveType.Types.I64],
            handler,
        }]),

        ...(options.noFloats ? [] : [{
            symbol: `f32.${name}`,
            param: [types.PrimitiveType.Types.F32, types.PrimitiveType.Types.F32],
            result: [types.PrimitiveType.Types.F32],
            handler,
        }, {
            symbol: `f64.${name}`,
            param: [types.PrimitiveType.Types.F64, types.PrimitiveType.Types.F64],
            result: [types.PrimitiveType.Types.F64],
            handler,
        }]),

        // TODO unsigned
        ...(options.signed ? [{
                symbol: `i32.${name}_s`,
                param: [types.PrimitiveType.Types.I32, types.PrimitiveType.Types.I32],
                result: [types.PrimitiveType.Types.I32],
                handler,
        }, {
            symbol: `i64.${name}_s`,
            param: [types.PrimitiveType.Types.I64, types.PrimitiveType.Types.I64],
            result: [types.PrimitiveType.Types.I64],
            handler,
        }] : []),
    ];
}

const instructions: AssemblyDBEntry[] = [
    // Math
    ...binaryMath('add'),
    ...binaryMath('sub'),
    ...binaryMath('mul'),
    ...binaryMath('div', { signed: true }, (ctx, [a, b]) => {
        try {
            return [a.clone().div(b)];
        } catch(e) {
            return new Error('division error');
        }
    }),
    ...binaryMath('rem', { signed: true, noFloats: true }),

    // Comparisons
    ...binaryMath('eq'),
    ...binaryMath('ne'),
    ...binaryMath('lt', { signed: true }),
    ...binaryMath('gt', { signed: true }),
    ...binaryMath('le', { signed: true }),
    ...binaryMath('ge', { signed: true }),

    // Bitwise
    ...binaryMath('and', { noFloats: true }),
    ...binaryMath('or', { noFloats: true }),
    ...binaryMath('xor', { noFloats: true }),
    ...binaryMath('shl', { noFloats: true }),
    ...binaryMath('shr', { noFloats: true, signed: true }),
    ...binaryMath('rotl', { noFloats: true }),
    ...binaryMath('rotr', { noFloats: true }),

    // Floating point operators
    ...binaryMath('max', { noInts: true }),
    ...binaryMath('min', { noInts: true }),
    ...binaryMath('copysign', { noInts: true }),

    // Equals zero
    {
        symbol: 'i32.eqz',
        param: [types.PrimitiveType.Types.I32],
        result: [types.PrimitiveType.Types.I32],
        handler: (ctx, [v]) => [new WasmNumber(WasmNumber.Type.I32, v.value == 0n ? 1n : 0n)],
    }, {
        symbol: 'i64.eqz',
        param: [types.PrimitiveType.Types.I64],
        result: [types.PrimitiveType.Types.I32],
        handler: (ctx, [v]) => [new WasmNumber(WasmNumber.Type.I32, v.value == 0n ? 1n : 0n)],
    },

    // Floating point unary operators
    ...genFloatUnaries(),

    // Conversions
    ...genConversions(),

    // Literals
    {
        symbol: 'i32.const',
        param: [],
        result: [types.PrimitiveType.Types.I32],
        handler: (ctx, _, instr) => [new WasmNumber(WasmNumber.Type.I32, BigInt(instr.split(' ')[1]))],
    },
    {
        symbol: 'i64.const',
        param: [],
        result: [types.PrimitiveType.Types.I64],
        handler: (ctx, _, instr) => [new WasmNumber(WasmNumber.Type.I64, BigInt(instr.split(' ')[1]))],
    },
    {
        symbol: 'f32.const',
        param: [],
        result: [types.PrimitiveType.Types.F32],
        handler: (ctx, _, instr) => [new WasmNumber(WasmNumber.Type.F32, Number(instr.split(' ')[1]))],
    },
    {
        symbol: 'f64.const',
        param: [],
        result: [types.PrimitiveType.Types.F64],
        handler: (ctx, _, instr) => [new WasmNumber(WasmNumber.Type.F64, Number(instr.split(' ')[1]))],
    },


];

/**
 * Generate conversions between int and float types
 */
function genConversions(): AssemblyDBEntry[] {
    // Type maps
    const tm: { [s: string] : types.PrimitiveType } = {
        i32: types.PrimitiveType.Types.I32,
        i64: types.PrimitiveType.Types.I64,
        f32: types.PrimitiveType.Types.F32,
        f64: types.PrimitiveType.Types.F64,
    };
    const ntMap: any = {
        i32: WasmNumber.Type.I32,
        i64: WasmNumber.Type.I64,
        f32: WasmNumber.Type.F32,
        f64: WasmNumber.Type.F64,
    };

    // Iterate over the different combinations
    const ret: AssemblyDBEntry[] = [
        {
            symbol: 'f64.promote_f32',
            param: [types.PrimitiveType.Types.F32],
            result: [types.PrimitiveType.Types.F64],
            handler: (ctx, [v]) => [new WasmNumber(WasmNumber.Type.F64, v.value)],
        }, {
            symbol: 'f32.demote_f64',
            param: [types.PrimitiveType.Types.F64],
            result: [types.PrimitiveType.Types.F32],
            handler: (ctx, [v]) => [new WasmNumber(WasmNumber.Type.F32, v.value)],
        }, {
            symbol: 'i32.wrap_i64',
            param: [types.PrimitiveType.Types.I64],
            result: [types.PrimitiveType.Types.I32],
            handler: (ctx, [v]) => [new WasmNumber(WasmNumber.Type.I32, v.value)],
        }, {   // TODO unsigned
            symbol: 'i64.extend_i32_u',
            param: [types.PrimitiveType.Types.I32],
            result: [types.PrimitiveType.Types.I64],
            handler: (ctx, [v]) => [new WasmNumber(WasmNumber.Type.F64, v.value)],
        }, {
            symbol: 'i64.extend_i32_s',
            param: [types.PrimitiveType.Types.I32],
            result: [types.PrimitiveType.Types.I64],
            handler: (ctx, [v]) => [new WasmNumber(WasmNumber.Type.F64, v.value)],
        },
    ];

    // Float to integer conversions
    ['_s', '_u'].forEach(sign =>
    ['i32','i64'].forEach(iType =>
    ['f32', 'f64'].forEach(fType =>
        ret.push({
            symbol: `${iType}.trunc_${fType}${sign}`,
            param: [tm[fType]],
            result: [tm[iType]],
            handler: (ctx, [v]) => [new WasmNumber(ntMap[iType], v.value)],
        }))));

    // Integer to float conversions
    ['_s', '_u'].forEach(sign =>
    ['i32','i64'].forEach(iType =>
    ['f32', 'f64'].forEach(fType =>
        ret.push({
            symbol: `${fType}.convert_${iType}${sign}`,
            param: [tm[iType]],
            result: [tm[fType]],
            handler: (ctx, [v]) => [new WasmNumber(ntMap[fType], v.value)],
        }))));

    // Reinterpret Cast
    [
        ['i32', 'f32'], ['i64', 'f64'],
        ['f32', 'i32'], ['f64', 'i64'],
    ].forEach(([to, from]) =>
        ret.push({
            symbol: `${to}.reinterpret_${from}`,
            param: [tm[from]],
            result: [tm[to]],
            handler: (ctx, [v]) => [v.clone().reinterpret()],
        }));

    // Sign extensions
    ([['i32', 8], ['i32', 16], ['i64', 8], ['i64', 16], ['i64', 32]] as [string, number][])
    .forEach(([type, width]) =>
        ret.push({
            symbol: `${type}.extend${width}_s`,
            param: [tm[type]],
            result: [tm[type]],
            handler: (ctx, [v]) => [v.clone().extend(width)]
        }));

    return ret;
}

/**
 * Generate entries floating point unary instrucitons avoiding boilerplate
 */
function genFloatUnaries(): AssemblyDBEntry[] {
    // Relevant Instructions
    const ops: Array<keyof WasmNumberKeys> = [
        'abs', 'neg', 'sqrt', 'ceil', 'floor', 'trunc', 'nearest'
    ];
    return ops.map((sym): AssemblyDBEntry[] => [{
        symbol: `f32.${sym}`,
        param: [types.PrimitiveType.Types.F32],
        result: [types.PrimitiveType.Types.F32],
        handler: (ctx: Context, [v]) => [(v.clone()[sym] as CallableFunction)()],
    }, {
        symbol: `f64.${sym}`,
        param: [types.PrimitiveType.Types.F64],
        result: [types.PrimitiveType.Types.F64],
        handler: (ctx: Context, [v]) => [(v.clone()[sym] as CallableFunction)()],
    }]).reduce((a, b) => a.concat(b));
}


const table: { [k: string]: AssemblyDBEntry }
    = instructions.reduce((a, v) => ({ ...a, [v.symbol]: v }), {});

/**
 * Invoke a webassembly instruction specified by the user
 * @param ctx compiler context
 * @param token location in code for debugging and errors
 * @param cmd assembly command to invoke
 * @returns invoke result type
 */
export function invokeAsm(ctx: Context, token: LexerToken, cmd: string) {
    // Get instruction database entry
    const mnemonic = cmd.split(' ')[0];
    const instr = table[mnemonic];
    if (!instr)
        return ['invalid/unsupported instruction ' + mnemonic];

    // Get positional args
    const args = ctx.popn(instr.param.length);
    for (let i = 0; i < instr.param.length; i++)
        if (!args[i].datatype || !instr.param[i].check(args[i].datatype)) {
            return ['positional argument invalid: ' + i];
        }

    // Behavior different for if it's constexpr or not
    if (args.some(e => !e.isConstExpr())) {
        // Not constexpr, push a new expression
        ctx.push(new expr.InstrExpr(token, instr.result[0], cmd, expr.fromDataValue(args)));
    } else {
        // Constexpr, use handler to reduce it
        const ret = instr.handler(ctx, args.map(a => a.value).reverse(), cmd);
        if (ret instanceof Error)
            return ret;
        ctx.push(...ret.map(e => new value.NumberValue(token, e)));
    }
}