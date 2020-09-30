
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

//
const NumberType = {
    I32,
    I64,
    F32,
    F64,
};

// Emulator for wasm number types
class WasmNumber {
    // type : NumberType,
    // _repr : Float*Array | Bigint

    /**
     * Make a wasm number wrapper
     *
     * @param {NumberType} type
     * @param {Number} n
     */
    constructor(type, n = 0) {
        this.type = type;
        set(n);
    }

    /**
     * Sets value for number
     *
     * @param {Number} n - value to set
     */
    set(n) {
        switch(this.type) {
            case NumberType.F32:
                this._repr = new Float32Array([n]);
                break;
            case NumberType.F64:
                this._repr = new Float64Array([n]);
                break;
            case NumberType.I32:
                this._repr = new BigInt(n);
                break;
            case NumberType.I64:
                this._repr = new BigInt(n);
                break;
        }
    }

    /**
     * Get value for the number
     *
     * @returns {Number} n
     */
    get() {
        switch(this.type) {
            case NumberType.F32:
            case NumberType.F64:
                return this._repr[0];
            case NumberType.I32:
            case NumberType.I64:
                return this._repr;
        }
    }

    /**
     * Deserialize
     * @param {Number|Object} n - input
     */
    fromJSON(n) {
        if (typeof n === 'object') {
            this.type = n.type || NumberType.F64;
            n = n.repr;
        }
        if (typeof n === 'number') {
            this.set(n);
            return;
        }
    }

    /**
     * Serialize
     */
    toJSON() {
        return {
            type: this.type,
            value: this.get(),
        };
    }



    // TODO these are stubs for now, in the future should add rest of operators
    //  and use the correct way so that we get same results as WASM

    /**
     * Overloaded + operator
     * @param {WasmNumber} a
     * @param {WasmNumber} b
     */
    static add(a, b) {
        // TODO
        return a.get() + b.get();
    }

    /**
     * Overloaded * operator
     * @param {WasmNumber} a
     * @param {WasmNumber} b
     */
    static mul(a, b) {
        // TODO
        return a.get() * b.get();
    }

    /**
     * Overloaded % operator
     * @param {WasmNumber} a
     * @param {WasmNumber} b
     */
    static mod(a, b) {
        // TODO
        return a.get() % b.get();
    }

};

module.exports = { WasmNumber, NumberType };