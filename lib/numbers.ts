
/**
 * Problem: WASM has 4 distinct number types and javascript doesn't
 * Solution A: Use ASM.js notation
 * - I don't like this solution
 * - it requires us to carefully rely on the js spec
 * - so could break in future/old browsers
 * Solution B: Use BigInt and Float*Array
 * - Probably worse performance
 * - More reliable and intuitive
 *
 */

// TODO: DON'T USE GET/SET METHODS!
// TODO: Use Int32Array instead of bigint for better backwards compatibility

// WASM Data Types
export enum NumberType {
    I32 = 1,
    I64 = 2,

    // Note Unsigned int types not fully supported
    U32 = 3,
    U64 = 4,

    F32 = 5,
    F64 = 6,
};

// Emulate WASM number types
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

    // Update we also have to update representation

    /**
     * Change type, also updates internal representation
     */
    set type(type: NumberType) {
        const v = this.value;
        this._type = type;
        this.value = v;
    }

    /**
     * Get value for the number
     *
     * @returns {Number}
     */
    get value(): number | bigint {
        switch(this.type) {
            // Float arrays
            case NumberType.F32:
            case NumberType.F64:
                return this._repr[0];

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
        return `(${this.typeName()} ${Number(this.value)})`;
    }

    /**
     *
     * @param s - string
     * @returns - this
     */
    fromString(s: string): this {
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
        if ('Ff'.includes(s[s.length -1])) {
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
            value: this.value[0] || this.value.toString(),
        };
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
            && (this._repr[0] || this._repr)
            === (other._repr[0] || other._repr);
    }

    /**
     * Coerce number to correct width
     */
    wrap() {
        switch (this.type) {
            // Wrap bits
            case NumberType.I32: case NumberType.U32:
                return BigInt.asIntN(32, this._repr as bigint);
            case NumberType.I64: case NumberType.U64:
                return BigInt.asIntN(64, this._repr as bigint);

            // Assume f32/64 numbers already reduced correctly
            case NumberType.F64:
            case NumberType.F32:
                return this._repr[0];
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
            throw new Error("Invalid WasmNumberType");

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
            throw new Error("Invalid WasmNumberType");

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
    mod(b: WasmNumber): this {
        // Only accept compatible types
        if (this.type !== b.type)
            throw new Error("Invalid WasmNumberType");

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
            throw new Error("Invalid WasmNumberType");

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
            throw new Error("Invalid WasmNumberType");

        // @ts-ignore
        this.value -= b.value;
        this.wrap();
        return this;
    }

    /**
     * Less than operator
     *
     * @param {WasmNumber} b - other
     * @returns {boolean}
     */
    lt(b: WasmNumber): boolean {
        // Only accept compatible types
        if (this.type !== b.type)
            throw new Error("Invalid WasmNumberType");

        return this.value < b.value;
    }

    /**
     * Greater than operator
     *
     * @param {WasmNumber} b - other
     * @returns {boolean}
     */
    gt(b: WasmNumber): boolean {
        // Only accept compatible types
        if (this.type !== b.type)
            throw new Error("Invalid WasmNumberType");

        return this.value > b.value;
    }

    // TODO more operators
};