import { LexerToken } from './scan.js';
import Context from './context.js';
import * as types from './datatypes.js'
import * as expr from './expr/index.js';
import * as value from './value.js';
import * as error from './error.js';
import WasmNumber, { NumberType } from './numbers.js';

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

// Types
type WasmNumberKeys = {
    [Key in keyof WasmNumber]: Extract<WasmNumber[Key], (..._: WasmNumber[]) => WasmNumber>;
};
interface BMathOptions {
    noInts?: boolean;
    signed?: boolean;
    noFloats?: boolean;
    bool?: boolean;
}

function binaryMath(
    // Operation to perform
    name: keyof WasmNumberKeys,

    // Characteristics of the instruction
    options: BMathOptions = {},

    // Type agnostic handler
    handler = (ctx: Context, args: WasmNumber[]): WasmNumber[] | Error =>
        [(args[0].clone()[name] as CallableFunction)(...args.slice(1))]
): AssemblyDBEntry[] {

    // Versions for each type
    return [
        ...(options.noInts ? [] : [{
            // Unsigned ints
            // TODO unsigned
            symbol: `i32.${name}${options.signed ? '_u' : ''}`,
            param: [types.PrimitiveType.Types.I32, types.PrimitiveType.Types.I32],
            result: [types.PrimitiveType.Types.I32],
            handler,
        }, {
            symbol: `i64.${name}${options.signed ? '_u' : ''}`,
            param: [types.PrimitiveType.Types.I64, types.PrimitiveType.Types.I64],
            result: [options.bool ? types.PrimitiveType.Types.I32 : types.PrimitiveType.Types.I64],
            handler,
        }]),

        // Floats
        ...(options.noFloats ? [] : [{
            symbol: `f32.${name}`,
            param: [types.PrimitiveType.Types.F32, types.PrimitiveType.Types.F32],
            result: [options.bool ? types.PrimitiveType.Types.I32 : types.PrimitiveType.Types.F32],
            handler,
        }, {
            symbol: `f64.${name}`,
            param: [types.PrimitiveType.Types.F64, types.PrimitiveType.Types.F64],
            result: [options.bool ? types.PrimitiveType.Types.I32 : types.PrimitiveType.Types.F64],
            handler,
        }]),

        // Signed ints
        // TODO unsigned
        ...(options.signed ? [{
                symbol: `i32.${name}_s`,
                param: [types.PrimitiveType.Types.I32, types.PrimitiveType.Types.I32],
                result: [options.bool ? types.PrimitiveType.Types.I32 : types.PrimitiveType.Types.I32],
                handler,
        }, {
            symbol: `i64.${name}_s`,
            param: [types.PrimitiveType.Types.I64, types.PrimitiveType.Types.I64],
            result: [options.bool ? types.PrimitiveType.Types.I32 : types.PrimitiveType.Types.I64],
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
    ...binaryMath('eq', { bool: true }),
    ...binaryMath('ne', { bool: true }),
    ...binaryMath('lt', { signed: true, bool: true }),
    ...binaryMath('gt', { signed: true, bool: true }),
    ...binaryMath('le', { signed: true, bool: true }),
    ...binaryMath('ge', { signed: true, bool: true }),

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

    // Integer unary operators
    ...genIntUnaries(),

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

    // Memory commands
    ...genMemory(),

    {
        symbol: 'nop',
        param: [],
        result: [],
        handler: () => [],
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
    const ntMap: { [k: string ] : NumberType } = {
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

/**
 * Generate entries for integer unary instructions avoiding boilerplate
 */
function genIntUnaries(): AssemblyDBEntry[] {
    const ops: Array<keyof WasmNumberKeys> = ['clz', 'ctz'];
    return [].concat(...ops.map((sym): AssemblyDBEntry[] => [{
        symbol: `i32.${sym}`,
        param: [types.PrimitiveType.Types.I32],
        result: [types.PrimitiveType.Types.I32],
        handler: (ctx: Context, [v]) => [(v.clone()[sym] as CallableFunction)()],
    }, {
        symbol: `i64.${sym}`,
        param: [types.PrimitiveType.Types.I64],
        result: [types.PrimitiveType.Types.I64],
        handler: (ctx: Context, [v]) => [(v.clone()[sym] as CallableFunction)()],
    }]));
}
/**
 * Memory instructions
 */
function genMemory() {
    // Some basic load instructions
    const ret = Object.values(types.PrimitiveType.Types)
        .filter(v => typeof v !== 'number')
        .map(t => ({
            symbol: `${t.name}.load`,
            param: [types.PrimitiveType.Types.I32],
            result: [t],
        }));

    // TODO load8_8 load8_s ... etc.

    // Get current linear memory size
    ret.push({
        symbol: 'memory.size',
        param: [],
        result: [types.PrimitiveType.Types.I32],
    });

    return ret;
}

// These aren't as simple to describe as they have polymorphism and stuff so we treat them as special operators
type HandlerFn = (ctx: Context, token: LexerToken, cmd: string) => string[] | null | void | error.SyntaxError;
const opInstrs: { [k : string] : HandlerFn } = {
    'select' : (ctx, token, cmd) => {
        // Get args
        if (ctx.stack.length < 3)
            return ['expected 3 arguments for select instruction'];
        const [trueVal, falseVal, cond] = ctx.popn(3);

        // Handle constexpr
        // NOTE here we're being leaniant
        if (cond.isConstExpr()) {
            if (!(cond.value instanceof WasmNumber) || cond.value.type !== WasmNumber.Type.I32)
                return ['expected an I32 condition'];
            ctx.push(cond.value.value ? trueVal : falseVal);
            return;
        }

        // Does the tuple type compile to a scalar primitive?
        const compilesToPrim = (t: types.Type): boolean => {
            // Primitive
            if (t instanceof types.ClassType)
                t = t.getBaseType();
            if (t instanceof types.PrimitiveType)
                return true;

            // Tuples (recursion for nesting)
            if (!(t instanceof types.TupleType))
                return false;
            if (!t.types.some(t => !(t instanceof types.DataType)))
                return false;
            const filteredTypes = (t.types as types.DataType[]).filter(t => !t.isUnit());
            if (filteredTypes.length !== 1)
                return false;
            return compilesToPrim(filteredTypes[0]);
        }

        // Validate inputs
        if (![value.ValueType.Data, value.ValueType.Expr].includes(trueVal.type) || trueVal.type != falseVal.type)
            return ['syntax error'];
        if (compilesToPrim(trueVal.datatype))
            return ['invalid datatype in true case of select instruction'];
        if (!trueVal.datatype.check(falseVal.datatype) || !falseVal.datatype.check(trueVal.datatype))
            return ['differing datatypes for different branches of select'];

        // Create select instruction
        ctx.push(new expr.InstrExpr(
            token,
            trueVal.datatype as types.DataType,
            cmd,
            expr.fromDataValue([trueVal, falseVal, cond], ctx),
        ));
    },
};

// Reformat for faster lookups
const instructionDict: { [k: string]: AssemblyDBEntry }
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
    if (opInstrs[mnemonic])
        return opInstrs[mnemonic](ctx, token, cmd);
    const instr = instructionDict[mnemonic];
    if (!instr)
        return ['invalid/unsupported instruction ' + mnemonic];

    // Get positional args
    const args = ctx.popn(instr.param.length);
    for (let i = 0; i < instr.param.length; i++)
        if (!args[i].datatype || !instr.param[i].check(args[i].datatype)) {
            return ['positional argument invalid: ' + i];
        }

    // Behavior different for if it's constexpr or not
    if (args.some(e => !e.isConstExpr()) || !instr.handler) {
        // Not constexpr, push a new expression
        ctx.push(new expr.InstrExpr(token, instr.result[0], cmd, expr.fromDataValue(args, ctx).reverse()));
    } else {
        // Constexpr, use handler to reduce it
        const ret = instr.handler(ctx, args.map(a => a.value).reverse(), cmd);
        if (ret instanceof Error)
            return ret;
        ctx.push(...ret.map(e => new value.NumberValue(token, e)));
    }
}
