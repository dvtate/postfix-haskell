
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

// WASM Data Types
const NumberType = {
    I32: 1,
    I64: 2,
    F32: 3,
    F64: 4,
};

// Emulator for wasm number types
class WasmNumber {
    // type : NumberType,
    // _repr : Float*Array | Bigint

    /**
     * Make a wasm number wrapper
     *
     * @param {NumberType} type - enum
     * @param {Number} n
     */
    constructor(type, n = 0) {
        if (type !== undefined) {
            this._type = type;
            this.value = n;
        } else {
            this._type = NumberType.F64;
            this._repr = 0;
        }
    }

    // Type enum
    static Type = NumberType;

    /**
     * Current numerical type
     *
     * @returns {WasmNumber.Type
     */
    get type() {
        return this._type;
    }

    // Update we also have to update representation

    /**
     * Change type, also updates internal representation
     */
    set type(type) {
        const n = this.get();
        this._type = type;
        this.set(n);
    }

    /**
     * Get value for the number
     *
     * @returns {Number}
     */
    get value() {
        switch(this.type) {
            // Float arrays
            case NumberType.F32:
            case NumberType.F64:
                return this._repr[0];

            // BigInt
            case NumberType.I32:
            case NumberType.I64:
                return this._repr;
        }
    }

    /**
     * Sets value for number
     *
     * @param {Number} n - value to set
     */
    set value(n) {
        switch(this.type) {
            case NumberType.F32:
                this._repr = new Float32Array([n]);
                break;
            case NumberType.F64:
                this._repr = new Float64Array([n]);
                break;
            case NumberType.I32:
                this._repr = BigInt(n);
                break;
            case NumberType.I64:
                this._repr = BigInt(n);
                break;
        }
    }

    /**
     * @returns {string} - relevant WASM instruction name
     */
    typeName() {
        return ['invalid', 'i32.const', 'i64.const', 'f32.const', 'f64.const'][this.type];
    }

    /**
     * @returns {string} - WAST representation
     */
    toWAST() {
        return `(${this.typeName()} ${Number(this.value)})`;
    }

    /**
     *
     * @param {string} s - string
     * @returns {WasmNumber} - this
     */
    fromString(s) {
        // Get size
        let isLong = false;
        if ('Ll'.includes(s[s.length - 1])) {
            s = s.slice(0, -1);
            isLong = true;
        }

        // Get type
        let isInt = true;
        let n;
        try {
            n = BigInt(s);
        } catch (_) {
            isInt = false;
            n = Number(s);
        }

        // Set value
        this._type = isInt
            ? (isLong ? NumberType.I64 : NumberType.I32)
            : (isLong ? NumberType.F64 : NumberType.F32);
        this.value = n;

        return this;
    }

    /**
     * Deserialize
     * @param {Number|Object} n - input
     */
    fromJSON(n) {
        if (typeof n === 'object') {
            this.type = n.type || NumberType.F64;
            n = n.value;
        }
        if (typeof n === 'number') {
            this.value = n;
            return;
        }
        if (typeof n === 'string') {
            // TODO accept serialized string since bigint can't be json'd
            throw "todo";
        }
    }

    /**
     * Serialize
     */
    toJSON() {
        return {
            type: this.type,
            value: this.value, // TODO this doesn't support bigint,,
        };
    }

    /**
     *
     */
    clone() {
        return new WasmNumber(this.type, this.value);
    }

    /**
     * Compare values of two WasmNumbers
     * @param {WasmNumber} other - Number to compare against
     * @returns {boolean}
     */
    equals(other) {
        return this.type === other.type && this._repr === other._repr;
    }

    /**
     * Coerce number to correct size
     */
    wrap() {
        switch (this.type) {
            // Wrap bits
            case NumberType.I32:
                return BigInt.asIntN(32, this._repr);
            case NumberType.I64:
                return BigInt.asIntN(64, this._repr);

            // Assume f32/64 numbers already reduced correctly
            case NumberType.F64:
            case NumberType.F32:
                return this._repr[0];
        }
    }

    // TODO these are stubs for now, in the future should add rest of operators
    //  and use the correct way so that we get *same results as WASM*

    /**
     * Overloaded + operator
     *
     * @param {WasmNumber} b
     */
    add(b) {
        // TODO switch on types
        this.value += b.value;
        this.wrap();
        return this;
    }

    /**
     * Overloaded * operator
     *
     * @param {WasmNumber} b
     */
    mul(b) {
        // TODO switch on types
        this.value *= b.value;
        this.wrap();
        return this;
    }

    /**
     * Overloaded % operator
     *
     * @param {WasmNumber} b
     */
    mod(b) {
        // TODO switch on types
        this.value %= b.value;
        this.wrap();
        return this;
    }

    /**
     * Overloaded / operator
     *
     * @param {WasmNumber} b
     */
    div(b) {
        // TODO switch on types
        this.value /= b.value;
        this.wrap();
        return this;
    }

    /**
     * Overloaded - operator
     *
     * @param {WasmNumber} b
     */
    sub(b) {
        // TODO switch on types
        this.value -= b.value;
        this.wrap();
        return this;
    }

    // TODO more
};

module.exports = { WasmNumber, NumberType };