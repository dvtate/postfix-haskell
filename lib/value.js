const types = require('./usertype');
const { WasmNumber, NumberType } = require('./numbers');
const { WASI } = require('wasi');

// Enum
const ValueType = {
    Macro:      0, //
    Data:       1, // Physically representable data
    TypeName:   2, // Type Identifier
    TypeDef:    3, // Type Definition
    Id:         4, // Escaped identifier
    DataExpr:   5, // Expressions describing operations on opaque data
};

// Instance of a struct
// Basically a stub
class StructData {
    constructor(schema) {
        // TODO
        if (!(schema instanceof types.Struct))
            throw new Error("Expected a type schema");

        this.fields = {};
        this.type = schema;
    }
};

// Primitive
const PrimitiveData = WasmNumber;

// Wasm data repr
class Data {
    // type: UserType
    // value: Any
    constructor(type, value) {
        this.type = type;
        this.value = value;
    }
};

// Interface Value
class Value {
    // type: ValueType,
    // value: Any,
    // token?: Token,
    constructor(type, value, token = null) {
        this.type = type;
        this.value = value;
        this.token = token;
    }

    /**
     *
     * @param {*} wasmNumber
     * @param {*} token
     */
    static number(wasmNumber, token) {
        const typeMap = Object.keys(NumberType).reduce((a, v) => ({
            ...acc,
            [NumberType[v]] : PrimitiveType.Types[v],
        }), {});
        const data = new Data(typeMap[wasmNumber.type], wasmNumber);
        return new Value(ValueType.Data, data, token);
    }

    /**
     * Convert Id's to values
     *
     * @param {Context} ctx -
     * @param {Object[]} [scopes] - optional scope to use for
     */
    deref(ctx, scopes) {
        if (this.type !== ValueType.Id)
            return this;

        scopes = scopes || ctx.scopes;
        console.log(this.value.id);
        return ctx.getId(this.value.id, scopes);
    }

    static ValueType = ValueType;
};

//
module.exports = {
    ValueType,
    Value,
    Data,
    StructData,
    PrimitiveData,
    types,
};