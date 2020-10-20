const types = require('./datatypes');
const { WasmNumber, NumberType } = require('./numbers');

// Enum
const ValueType = {
    Macro:      0, //
    Data:       1, // Physically representable data
    TypeName:   2, // Type Identifier
    Type:       3, // Type Definition
    Id:         4, // Escaped identifier
    Expr:   5, // Expressions describing operations on opaque data
};

// Generic value base class
class Value {
    // type: ValueType,
    // value: Any,
    // token?: Token,
    constructor(token, type, value) {
        this.token = token;
        this.type = type;
        this.value = value;
    }

    /**
     * @virtual
     */
    deref() {
        return this;
    }
};

// Data with a user-level type, this includes unions, structs and aliases
class UserValue extends Value {
    constructor(token, type, value) {
        super(token, ValueType.Data, value);
        this.datatype = type;
    }
};

// Primitive data, native wasm types
class NumberValue extends UserValue {
    /**
     * @constructor
     * @param {WasmNumber} wasmNumber
     * @param {LexerToken} token
     */
    constructor(token, wasmNumber) {
        super(token, ValueType.Data, wasmNumber);
        this.datatype = NumberValue._typeMap[wasmNumber.type];
    }

    //
    static _typeMap = Object.keys(NumberType).reduce((acc, v) => ({
        ...acc,
        [NumberType[v]] : types.Primitive.Types[v],
    }), {});
};

// Identifier
class IdValue extends Value {
    constructor(token, value) {
        super(token, ValueType.Id, value);
    }

    /**
     * Convert Id's to values
     *
     * @param {Context} ctx -
     * @param {Object[]} [scopes] - optional scope to use for
     */
    deref(ctx, scopes) {
        scopes = scopes || this.scopes || ctx.scopes;
        // console.log(this.value.id);
        return ctx.getId(this.value.id, scopes);
    }
};



module.exports = {
    ValueType,
    Value,
    UserValue,
    IdValue,
    NumberValue,
    types,
};