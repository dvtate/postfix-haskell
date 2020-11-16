const types = require('./datatypes');
const { WasmNumber, NumberType } = require('./numbers');

/**
 * In this context, Values are equivalent to nodes on an AST
 */

// Enum to represent what syntaxtic type is currently on the stack
const ValueType = {
    Macro:  0, // Macro Literal
    Data:   1, // Physically representable data (class/)
    Type:   2, // DataType/schema
    Id:     3, // Escaped identifier
    Expr:   4, // Expressions describing operations on opaque data
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
};

// Data with a user-level type, this includes unions, structs and aliases
class DataValue extends Value {
    constructor(token, type, value) {
        super(token, ValueType.Data, value);
        this.datatype = type;
    }
};

// Primitive data, native wasm types
class NumberValue extends DataValue {
    /**
     * @constructor
     * @param {WasmNumber} wasmNumber
     * @param {LexerToken} token
     */
    constructor(token, wasmNumber) {
        super(token, ValueType.Data, wasmNumber);
        this.datatype = NumberValue._typeMap[wasmNumber.type];
    }

    // Map of number types to coresponding primitive datatypes
    static _typeMap = Object.keys(NumberType).reduce((acc, v) => ({
        ...acc,
        [NumberType[v]] : types.Primitive.Types[v],
    }), {});
};

// Escaped Identifier
class IdValue extends Value {
    constructor(token, id, scopes) {
        super(token, ValueType.Id, id);
        this.scopes = scopes;
    }

    /**
     * Convert Id's to values
     *
     * @param {Context} ctx - current context
     */
    deref(ctx) {
        return ctx.getId(this.value.id, this.scopes || ctx.scopes);
    }
};

// Packed values
class TupleValue extends DataValue {
    /**
     * @param {Value[]} values
     */
    constructor(token, values = []) {
        const type = new types.TupleType(token, values.map(v => v.datatype));
        super(token, type, values);
    }
};

// Note that there is no need for a UnionValue class because there are no instances of unions
// unions will only be needed as types for opaque-expressions or

module.exports = {
    ValueType,
    Value,
    DataValue,
    IdValue,
    NumberValue,
    TupleValue,
    types,
};