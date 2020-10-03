// Enum
const ValueType = {
    Macro:      0, //
    Number:     1, // Unknown numeric type
    Struct:     2, // Type Instance
    TypeName:   5, // Type Identifier
    TypeDef:    6, // Type Definition
    Id:         6, // Escaped identifier

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

    static ValueType = ValueType;
};

//
module.exports = {
    ValueType,
    Value,
};