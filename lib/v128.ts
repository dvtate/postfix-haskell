

function enumMap(...strs: string[]) {
    let ret: { [k: number | string] : number | string } = {};
    strs.forEach((s, i) => ret[ret[s] = i] = s);
    return ret;
}
const ElemTypeMap = enumMap('i8', 'i16', 'i32', 'i64', 'f32', 'f64');

// Emulate WASM's v128 datatype
export default class PackedV128 {
    public buffer: ArrayBuffer;

    constructor(input: ArrayBuffer | string) {
        if (typeof input === 'string') {
            this.buffer = new ArrayBuffer(16);
            this.fromString(input);
        } else if (input instanceof ArrayBuffer) {
            this.buffer = input;
        } else {
            throw new TypeError('Invalid input to PackedV128 constructor');
        }
    }

    fromString(s: string) {
        // WAT V128 literal expression forms:
        // v128.const i8x16 i8 i8 i8 i8 i8 i8 i8 i8 i8 i8 i8 i8 i8 i8 i8 i8
        // v128.const i16x8 i16 i16 i16 i16 i16 i16 i16 i16
        // v128.const i32x4 i32 i32 i32 i32
        // v128.const i64x2 i64 i64
        // v128.const f32x4 f32 f32 f32 f32
        // v128.const f64x2 f64 f64

        // Skip WAT instruction if present
        if (s.startsWith('v128.const '))
            s = s.slice( 'v128.const '.length);

        const parts = s.split(' ');
        const elemType = parts[0].split('x')[0];
        parts.shift();

        // Parse elements
        switch (elemType) {
            case 'i8': {
                const arr = new Int8Array(this.buffer);
                if (parts.length !== 16)
                    throw new Error('invalid v128 literal - expected 16 i8\'s');
                parts.forEach((e, i) => arr[i] = parseInt(e));
            }
            case 'i16': {
                const arr = new Int16Array(this.buffer);
                if (parts.length !== 8)
                    throw new Error('invalid v128 literal - expected 8 i16\'s');
                parts.forEach((e, i) => arr[i] = parseInt(e));
            }
            case 'i32': {
                const arr = new Int32Array(this.buffer);
                if (parts.length !== 4)
                    throw new Error('invalid v128 literal - expected 4 i32\'s');
                parts.forEach((e, i) => arr[i] = parseInt(e));
            }
            case 'i64': {
                const arr = new BigInt64Array(this.buffer);
                if (parts.length !== 2)
                    throw new Error('invalid v128 literal - expected 2 i64\'s');
                parts.forEach((e, i) => arr[i] = BigInt(e));
            }
            case 'f32': {
                const arr = new Float32Array(this.buffer);
                if (parts.length !== 4)
                    throw new Error('invalid v128 literal - expected 4 f32\'s');
                parts.forEach((e, i) => arr[i] = Number(e));
            }
            case 'f64': {
                const arr = new Float64Array(this.buffer);
                if (parts.length !== 2)
                    throw new Error('invalid v128 literal - expected 2 f64\'s');
                parts.forEach((e, i) => arr[i] = Number(e));
            }
        default: 
            throw new Error('invalid v128 literal expression');
        }
    }

    'i8x16.swizzle'(mapping: Uint8Array | Array<number>) {
        if (mapping instanceof Array)
            mapping = new Uint8Array(mapping);
        if (mapping.length != 16)
            throw new Error('i8x16.swizzle: invalid immediate');
        
        const arr = new Uint8Array(this.buffer);
        const copy = arr.slice();
        for (let i = 0; i < mapping.length; i++) {
            if (mapping[i] >= 16)
                throw new Error('i8x16.swizzle: invalid immediate');
            arr[i] = copy[mapping[i]];
        }
    }

}