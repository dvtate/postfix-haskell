
/**
 * Problem: WASM has 4 distinct number types and javascript doesn't
 * Solution A: Use ASM.js notation
 * - I don't like this solution
 * - it requires us to carefully rely on the js spec
 * - so could break in future/old browsers and other interpreters
 * Solution B: Use BigInt and Float*Array
 * - Probably worse performance
 * - More reliable and intuitive
 */

// TODO don't use get/set methods?
// TODO Use Int32Array instead of bigint for better backwards compatibility?

// NOTE the names of methods are important and shouldn't be changed
//      they are used in asm.ts and correspond to wat mnemonics

/**
 * Numeric data types
 */
export enum NumberType {
    I32 = 1,
    I64 = 2,

    // Note Unsigned int types not fully supported
    U32 = 3,
    U64 = 4,

    F32 = 5,
    F64 = 6,
}

/**
 * Emulate WASM number values and operations on them
 */
export default class WasmNumber {
    // type : NumberType,
    // _repr : Float*Array | Bigint
    _type: NumberType;
    _repr: Float32Array | Float64Array | bigint;

    /**
     * Make a wasm number wrapper
     *
     * @param {NumberType} type - enum
     * @param {Number} n
     */
    constructor(type: NumberType = NumberType.F64, n: number | bigint = 0) {
        this._type = type;
        this.value = n;
    }

    // Type enum
    static Type = NumberType;

    /**
     * Current numerical type
     *
     * @returns {WasmNumber.Type}
     */
    get type(): NumberType {
        return this._type;
    }

    /**
     * Change type, also updates internal representation
     */
    set type(type: NumberType) {
        const v = this.value;
            // typeof this._repr == 'bigint' ? this._repr : this._repr[0];
        this._type = type;
        this.value = v;
    }

    /**
     * Get value for the number
     */
    get value(): number | bigint {
        switch(this.type) {
            // Float arrays
            case NumberType.F32:
            case NumberType.F64:
                return (this._repr as Float32Array)[0];

            // BigInt
            case NumberType.I32:
            case NumberType.I64:
            case NumberType.U32:
            case NumberType.U64:
                return this._repr as bigint;
        }
    }

    /**
     * Sets value for number
     *
     * @param {Number} n - value to set
     */
    set value(n : number | bigint) {
        switch(this.type) {
            case NumberType.F32:
                this._repr = new Float32Array([Number(n)]);
                break;
            case NumberType.F64:
                this._repr = new Float64Array([Number(n)]);
                break;

            case NumberType.U32:
            case NumberType.U64:
            case NumberType.I32:
            case NumberType.I64:
                this._repr = BigInt(n);
                this.wrap();
                break;
        }
    }

    /**
     * @returns {string} - relevant WASM instruction name
     */
    typeName(): string {
        return ['invalid', 'i32.const', 'i64.const', 'i32.const', 'i64.const', 'f32.const', 'f64.const'][this.type];
    }

    /**
     * @returns {string} - WAST representation
     */
    toWAST(): string {
        // Infinity
        if (typeof this.value === 'number' && !isFinite(this.value) && !isNaN(this.value))
            return `(${this.typeName()} ${this.value < 0 ? '-' : ''}inf)`;
        return `(${this.typeName()} ${Number(this.value)})`;
    }

    /**
     * Parse String
     * @param s - string
     * @returns - this
     */
    fromString(s: string): this {
        // Character literal -- i32
        if (s.startsWith('\'')) {
            this._type = NumberType.I32;
            this.value = JSON.parse(`"${s.slice(1, -1)}"`).charCodeAt(0);
            return this;
        }

        // Get size
        let isLong = false;
        if ('Ll'.includes(s[s.length - 1])) {
            s = s.slice(0, -1);
            isLong = true;
        }

        // Get sign
        let isUnsigned = false;
        if ('Uu'.includes(s[s.length - 1])) {
            s = s.slice(0, -1);
            isUnsigned = true;
        }

        let isFloat = false;
        if ('Ff'.includes(s[s.length -1]) && !s.includes('x')) {
            s = s.slice(0, -1);
            isFloat = true;
        }

        // Get type
        let isInt = true;
        let n : bigint | number;
        try {
            n = BigInt(s);
        } catch (_) {
            isInt = false;
            n = Number(s);
        }

        // Set value
        this._type = isInt
            ? isLong
                ? isUnsigned ? NumberType.U64 : NumberType.I64
                : isUnsigned ? NumberType.U32 : NumberType.I32
            : isFloat ? NumberType.F32 : NumberType.F64;
        this.value = n;

        return this;
    }

    /**
     * Deserialize
     * @param {Number|Object} n - input
     */
    fromJSON(n : number | bigint | string | any) {
        if (typeof n === 'object') {
            this.type = n.type || NumberType.F64;
            n = n.value;
        }
        if (typeof n === 'number' || typeof n === 'bigint') {
            this.value = n;
            return;
        }
        if (typeof n === 'string') {
            // accept serialized string since bigint can't be json'd
            try {
                this.value = BigInt(n);
            } catch (e) {
                this.value = Number(n);
            }
            return;
        }
    }

    /**
     * Serialize
     */
    toJSON(): { type: NumberType, value: string | number }
    {
        return {
            type: this.type,
            value: this.toString(),
        };
    }

    toString() {
        function floatToString(num: number) {
            // Special cases
            if (isNaN(num))
                return "NaN";
            if (!isFinite(num))
                return num > 0 ? "Infinity" : "-Infinity";
            if (Object.is(num, -0))
                return "-0.0";

            // Convert number to string
            let str = num.toString();

            // Add ".0" if there's no decimal point
            if (!str.includes("."))
                str += ".0";
            return str;
        }

        switch (this.type) {
            case NumberType.F32:
                return floatToString(this.value as number) + 'f';
            case NumberType.F64:
                return floatToString(this.value as number);
            case NumberType.I32:
                return this.value.toString();
            case NumberType.U32:
                return this.value.toString() + 'U';
            case NumberType.I64:
                return this.value.toString() + 'L';
            case NumberType.U64:
                return this.value.toString() + 'UL';
        }
    }

    /**
     * Clone self
     */
    clone(): WasmNumber {
        return new WasmNumber(this.type, this.value);
    }

    /**
     * Compare values of two WasmNumbers
     * @param {WasmNumber} other - Number to compare against
     * @returns {boolean}
     */
    equals(other : WasmNumber): boolean {
        return this.type === other.type
            && ((<any>this._repr)[0] || this._repr)
            === ((<any>other._repr)[0] || other._repr);
    }

    /**
     * @alias equals to match wasm instruction
     */
    eq(other: WasmNumber) {
        return new WasmNumber(NumberType.I32, this.equals(other) ? 1 : 0);
    }

    /**
     * Not of this.eq()
     * @param other Number to compare against
     */
    ne(other: WasmNumber) {
        return new WasmNumber(NumberType.I32, this.equals(other) ? 0 : 1);
    }

    /**
     * Coerce number to correct width
     */
    wrap() {
        switch (this.type) {
            // Wrap bits
            case NumberType.I32: case NumberType.U32:
                this._repr = BigInt.asIntN(32, this._repr as bigint);
                break;
            case NumberType.I64: case NumberType.U64:
                this._repr = BigInt.asIntN(64, this._repr as bigint);
                break;
            // f32/64 numbers should already be reduced correctly by containers
        }
    }

    /**
     * Overloaded + operator
     *
     * @param {WasmNumber} b
     */
    add(b: WasmNumber): this {
        // Only accept compatible types
        if (this.type !== b.type)
            throw new Error("Incompatible WasmNumberType");

        // @ts-ignore
        this.value += b.value;
        this.wrap();
        return this;
    }

    /**
     * Overloaded * operator
     *
     * @param {WasmNumber} b
     */
    mul(b: WasmNumber): this {
        // Only accept compatible types
        if (this.type !== b.type)
            throw new Error("Incompatible WasmNumberType");

        // @ts-ignore
        this.value *= b.value;
        this.wrap();
        return this;
    }

    /**
     * Overloaded % operator
     *
     * @param {WasmNumber} b
     */
    rem(b: WasmNumber): this {
        // Only accept compatible types
        if (this.type !== b.type)
            throw new Error("Incompatible WasmNumberType");

        // @ts-ignore
        this.value %= b.value;
        this.wrap();
        return this;
    }

    /**
     * Overloaded / operator
     *
     * @param {WasmNumber} b
     */
    div(b: WasmNumber): this {
        // Only accept compatible types
        if (this.type !== b.type)
            throw new Error("Incompatible WasmNumberType");

        // TODO signed vs unsigned
        // @ts-ignore
        this.value /= b.value;
        this.wrap();
        return this;
    }

    /**
     * Overloaded - operator
     *
     * @param {WasmNumber} b
     */
    sub(b: WasmNumber): this {
        // Only accept compatible types
        if (this.type !== b.type)
            throw new Error("Incompatible WasmNumberType");

        // @ts-ignore
        this.value -= b.value;
        this.wrap();
        return this;
    }

    /**
     * Less than operator
     *
     * @param {WasmNumber} b - other
     * @returns i32 result
     */
    lt(b: WasmNumber) {
        // Only accept compatible types
        if (this.type !== b.type)
            throw new Error("Incompatible WasmNumberType");

        return new WasmNumber(NumberType.I32, this.value < b.value ? 1 : 0);
    }

    /**
     * Greater than operator
     *
     * @param {WasmNumber} b - other
     * @returns i32 result
     */
    gt(b: WasmNumber) {
        // Only accept compatible types
        if (this.type !== b.type)
            throw new Error("Incompatible WasmNumberType");

        return new WasmNumber(NumberType.I32, this.value > b.value ? 1 : 0);
    }

    /**
     * Less than or equal to operator
     * @param b other
     * @returns i32 result
     */
    le(b: WasmNumber) {
        // Only accept compatible types
        if (this.type !== b.type)
            throw new Error("Incompatible WasmNumberType");

        return new WasmNumber(NumberType.I32, this.value <= b.value ? 1 : 0);
    }

    /**
     * Greater than or equal to operator
     * @param b other
     * @returns i32 result
     */
    ge(b: WasmNumber) {
        // Only accept compatible types
        if (this.type !== b.type)
            throw new Error("Incompatible WasmNumberType");

        return new WasmNumber(NumberType.I32, this.value >= b.value ? 1 : 0);
    }

    /**
     * Bitwise and operator
     * @param b other
     */
    and(b: WasmNumber) {
        // Only accept compatible types
        if (this.type !== b.type)
            throw new Error("Incompatible WasmNumberType");

        // @ts-ignore
        this.value = this.value & b.value;
        return this;
    }

    /**
     * Bitwise or operator
     * @param b other
     */
    or(b: WasmNumber) {
        // Only accept compatible types
        if (this.type !== b.type)
            throw new Error("Incompatible WasmNumberType");

        // @ts-ignore
        this.value = this.value | b.value;
        return this;
    }

    /**
     * Bitwise xor operator
     * @param b other
     */
    xor(b: WasmNumber) {
        // Only accept compatible types
        if (this.type !== b.type)
            throw new Error("Incompatible WasmNumberType");

        // @ts-ignore
        this.value = this.value ^ b.value;
        return this;
    }

    /**
     * Left bitshift operator
     * @param b other
     */
    shl(b: WasmNumber) {
        // Only accept compatible types
        if (this.type !== b.type)
            throw new Error("Incompatible WasmNumberType");

        // @ts-ignore
        this.value = this.value << b.value;
        return this;
    }

    /**
     * Right bitshift operator
     * @param b other
     * @param signed do we used signed vs unsigned bitshift operation
     */
    shr(b: WasmNumber, signed = true) {
        // Only accept compatible types
        if (this.type !== b.type)
            throw new Error("Incompatible WasmNumberType");

        // @ts-ignore
        this.value = signed ? this.value >> b.value : this.value >> b.value;
        return this;
    }

    /**
     * Bitwise rotl operator
     * @param b other
     */
    rotl(b: WasmNumber) {
        // Only accept compatible types
        if (this.type !== b.type)
            throw new Error("Incompatible WasmNumberType");

        // TODO implement
        throw new Error('TODO');
    }

    /**
     * Bitwise rotr operator
     * @param b other
     */
    rotr(b: WasmNumber) {
        // Only accept compatible types
        if (this.type !== b.type)
            throw new Error("Incompatible WasmNumberType");

        // TODO implement
        throw new Error('TODO');
    }

    /**
     * Select bigest of two numbers
     * @param b other
     * @returns maxmimum
     */
    max(b: WasmNumber) {
        // Only accept compatible types
        if (this.type !== b.type)
            throw new Error("Incompatible WasmNumberType");

        return this.value > b.value ? this : b;
    }

    /**
     * Select the lowest of two numbers
     * @param b other
     * @returns minimum
     */
    min(b: WasmNumber) {
        // Only accept compatible types
        if (this.type !== b.type)
            throw new Error("Incompatible WasmNumberType");

        return this.value < b.value ? this : b;
    }

    /**
     * Performs copysign operation
     * @param b other
     */
    copysign(b: WasmNumber) {
        // Check types
        if (this.type !== b.type)
            throw new Error("Incompatible WasmNumberType");

        this.value = Math.sign(Number(this.value)) === Math.sign(Number(b.value))
            ? this.value
            : -this.value;
        return this;
    }

    /**
     * calculate absolute value
     */
    abs() {
        // Check types
        if (this.type !== NumberType.F32 && this.type !== NumberType.F64)
            throw new Error('Only valid for floats');

        // @ts-ignore
        this.value = Math.abs(this.value)
        return this;
    }

    /**
     * Negate self
     */
    neg() {
        this.value = -this.value;
        return this;
    }

    /**
     * Calculate Square route
     */
    sqrt() {
        // Check types
        if (this.type !== NumberType.F32 && this.type !== NumberType.F64)
            throw new Error('Only valid for floats');

        // @ts-ignore
        this.value = Math.sqrt(this.value)
        return this;
    }

    /**
     * Calculate Ceiling
     */
    ceil() {
        // Check types
        if (this.type !== NumberType.F32 && this.type !== NumberType.F64)
            throw new Error('Only valid for floats');

        // @ts-ignore
        this.value = Math.ceil(this.value)
        return this;
    }

    /**
     * Calculate floor
     */
    floor() {
        // Check types
        if (this.type !== NumberType.F32 && this.type !== NumberType.F64)
            throw new Error('Only valid for floats');

        // @ts-ignore
        this.value = Math.floor(this.value)
        return this;
    }

    /**
     * Truncate the number
     */
    trunc() {
        // Check types
        if (this.type !== NumberType.F32 && this.type !== NumberType.F64)
            throw new Error('Only valid for floats');

        // @ts-ignore
        this.value = Math.trunc(this.value)
        return this;
    }

    /**
     * Round to nearest ties go to even
     * @note this differs from JS and C!
     */
    nearest() {
        // Check types
        if (this.type !== NumberType.F32 && this.type !== NumberType.F64)
            throw new Error('Only valid for floats');

        // Behavior is different from Math.round when there's a tie
        // In that case we round to nearest even int
        const n = this.value as number;
        const dec = n % 1;
        if (dec === 0.5) {
            const floor = n - dec;
            this.value = floor % 2 !== 0
                ? floor + 1
                : floor;
        } else {
            this.value = Math.round(n);
        }
        return this;
    }

    /**
     * Reinterpret the bits of float types into ints and vice versa
     * @note little endian because webassembly
     */
    reinterpret() {
        switch(this.type) {
            // F32 -> I32
            case NumberType.F32: {
                const v = this._repr as Float32Array;
                const dv = new DataView(v.buffer);
                this._repr = BigInt(dv.getInt32(0, true));
                this._type = NumberType.I32;
                return this;
            }

            // F64 -> I64
            case NumberType.F64: {
                const v = this._repr as Float64Array;
                const dv = new DataView(v.buffer);
                this._repr = dv.getBigInt64(0, true);
                this._type = NumberType.I64;
                return this;
            }

            // I32 -> F32
            case NumberType.I32: {
                const v = this._repr as bigint;
                this._repr = new Float32Array([0]);
                const dv = new DataView(this._repr.buffer);
                dv.setInt32(0, Number(v), true);
                this._type = NumberType.F32;
                return this;
            }

            // I64 -> F64
            case NumberType.I64: {
                const v = this._repr as bigint;
                this._repr = new Float64Array([0]);
                const dv = new DataView(this._repr.buffer);
                dv.setBigInt64(0, v, true);
                this._type = NumberType.F64;
                return this;
            }

            default:
                throw new Error("fuck");
        }
    }

    /**
     * Extend an i32 into an i64
     * @note reference: https://en.wikipedia.org/wiki/Sign_extension
     * @param nbits number of bits to sign extend to
     * @param signed should we emulate the _s version of this instruction (true) or _u version (false)?
     */
    extend(nbits: number, signed = this._type === NumberType.I32) {
        // For unsigned int the only difference is leading zeros
        if (!signed) {
            this.type = nbits > 32 ? NumberType.I64 : NumberType.I32;
            return this;
        }

        // The value of the sign bit
        const mask: bigint = 1n << BigInt(nbits - 1);

        let i = BigInt(this.value);
        i = i & ((1n << BigInt(nbits)) - 1n);  // (Skip this if bits in x above position b are already zero.)
        this.value = (i ^ mask) - mask;

        return this;
    }

    /**
     * Count the leading zeros
     */
    clz() {
        if ([NumberType.F32, NumberType.F64].includes(this._type))
            throw new Error('Integer-only operation used on float type');

        function clz32(v: bigint) {
            let x = BigInt(0n != (v >> 16n)) * 16n;
            x += BigInt(0n != (v >> (x + 8n))) * 8n;
            x += BigInt(0n != (v >> (x + 4n))) * 4n;
            x += BigInt(0n != (v >> (x + 2n))) * 2n;
            x += BigInt(0n != (v >> (x + 1n)));
            x += BigInt(0n != (v >> x));
            return 32n - x;
        }

        if ([NumberType.I32, NumberType.U32].includes(this._type))
            this.value = clz32(this._repr as bigint);
        else if ([NumberType.I64, NumberType.U64].includes(this._type)) {
            const v = this._repr as bigint;
            const upper = v >> 32n;
            const lower = v & 0xFF_FF_FF_FFn;
            this.value = upper ? clz32(upper) : 32n + clz32(lower);
        }
        return this;
    }

    /**
     * Count trailing zeros
     */
    ctz() {
        // Should never get called when invalid
        if ([NumberType.F32, NumberType.F64].includes(this._type))
            throw new Error('Integer-only operation used on float type');

        // Edge case
        if (this._repr === 0n) {
            this.value = [NumberType.I32, NumberType.U32].includes(this._type) ? 32n : 64n;
            return this;
        }

        let ret = 0;
        let v = this._repr as bigint;
        while ((v & 1n) === 0n) {
            v >>= 1n;
            ret++;
        }
        this.value = BigInt(ret);
        return this;
    }
}
