/**
 * Types can be compared by their ids
 *
 * I feel like this is overengineered af
 */

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