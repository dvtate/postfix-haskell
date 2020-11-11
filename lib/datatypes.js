/**
 * Types can be compared by their ids
 *
 * I feel like this is overengineered af
 */

const { type } = require("os");
const { types } = require("./value");

// Checkable type
class UserType {
    static _uuid = 1;
    constructor(token) {
        this.id = UserType._uuid++;
        this.token = token;
    }

    deAlias() {
        return this;
    }

    /**
     * Returns true if other type is equivalent
     * @param {UserType} other
     * @virtual
     */
    check(other) {
        return this.id == other.id;
    }
};

// Type with named fields
class Struct extends UserType {
    /**
     * @param {Object<Struct, Union, Primitive>} types
     */
    constructor(token, types = []) {
        super(token);
        this.types = types;
    }

    // /**
    //  * Checks if structure has same field types
    //  * @override
    //  */
    // check(other) {
    //     if (other instanceof Struct || other instanceof Alias) {
    //         this.types.forEach((t, i) => {
    //             t.check(other.types[i]);
    //         });
    //     }
    // }
};

// Allows anything in set of types
class Union extends UserType {
    /**
     * @param {Array<Struct, Union, Primitive>} types
     */
    constructor(token, types = []) {
        super(token);
        this.types = types;
    }

    /**
     * @override
     */
    check(other) {
        return this.types.some(type => type.check(other));
    }
};

// Different name for same type
class Alias extends UserType {
    constructor(token, otherType) {
        super(token);
        this.id = otherType.id;
        this.alias = otherType;
    }

    /**
     * Get original type
     */
    deAlias() {
        return this.alias.deAlias() || this;
    }

    /**
     * @override
     */
    check(other) {
        this.alias.check(other);
    }
};

// Type that is inherent to target platform
class Primitive extends UserType {
    // WASM
    static Types = {
        I32: new Primitive("I32"),
        I64: new Primitive("I64"),
        F32: new Primitive("F32"),
        F64: new Primitive("F64"),
    };

    /**
     * @override
     */
    check(other) {
        if (other instanceof Primitive)
            return this.id === other.id;
        return false;
    }
};

// TODO
class ParametricType extends UserType {
    // Similar to alias except
    // Has it's own id, that it checks against others with
    //  Requires other to also be same parametric type
};

module.exports = {
    UserType,
    Primitive,
    Union,
    Struct,
    Alias,
};


// //
// class I32PrimitiveType {
//     constructor() { this.name = "I32"; }
// };
// class I64PrimitiveType {
//     constructor() { this.name = "I64"; }
// };
// class F32PrimitiveType {
//     constructor() { this.name = "F32"; }
// };
// class F64PrimitiveType {
//     constructor() { this.name = "F64"; }
// };

// const PrimitiveTypes = {
//     I32: new I32PrimitiveType(),
//     I64: new I64PrimitiveType(),
//     F32: new F32PrimitiveType(),
//     F64: new F64PrimitiveType(),
// };

// //
// class Type {

// };

// // More specific than types, used for applying methods and stuff
// class Class extends Type {
//     static _uid = 0;
//     constructor(token, type) {
//         super();
//         this.token = token;
//         this.id = Class._uid++;
//         this.type = type;
//     }

//     /**
//      * Verify compatible type
//      * @param {Type} type
//      * @param {boolean} classMatch
//      */
//     check(type, classMatch = false) {
//         // Already matched class, only need to typecheck
//         if (classMatch)
//             return this.type.check(type, true);

//         // Class is a match, do typecheck
//         if (this.id === type.id)
//             return this.type.check(type, true);

//         // Class not a match, Try next class in sequence
//         if (this.type instanceof Class)
//             return this.type.check(type);

//         // No class sequence, no match
//         return false;
//     }
// };

// // When need to be able to handle more than one type
// //  Used for types resulting from `|` operator
// class UnionType extends Type {
//     /**
//      * @param {Type[]} types
//      */
//     constructor(token = null, types = []) {
//         super();
//         this.token = token;
//         this.types = types;
//     }

//     /**
//      * Verify compatible type
//      * @param {Type} type
//      */
//     check(type) {
//         // Verify other union is subset of this one
//         if (type instanceof UnionType)
//             return type.types.every(t => this.types.includes(t));

//         // Verify type is in this set
//         return this.types.includes(type);
//     }
// };

// // When need to store more than one piece of data in a single value
// //  Used for types resulting from `pack` operator
// class TupleType {
//     /**
//      * @param {Type[]} types
//      */
//     constructor(token = null, types = []) {
//         super();
//         this.token = token;
//         this.types = types;
//     }

//     /**
//      * Verify compatible type
//      * @param {Type} type
//      */
//     check(type) {
//         // Not a tuple
//         if (!(type instanceof TupleType))
//             return false;

//         // Different size
//         if (this.types.length !== other.types.length)
//             return false;

//         // Verify types match
//         for (let i = 0; i < this.types.length; i++)
//             if (!this.types[i].check(other.types[i]))
//                 return false;
//         return true;
//     }
// };