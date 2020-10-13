/**
 * Types can be compared by their ids
 *
 * I feel like this is overengineered af
 */

// Checkable type
class UserType {
    static _uuid = 5;
    constructor(name) {
        this.id = UserType.uuid++;
        this.name = name;
    }

    /**
     * Returns true if other type is equivalent
     * @param {UserType} other
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
    constructor(name, types = {}) {
        super(name);
        this.types = types;
    }
};

// Allows anything in set of types
class Union extends UserType {
    /**
     * @param {Array<Struct, Union, Primitive>} types
     */
    constructor(name, types = []) {
        super(name);
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
    constructor(name, otherType) {
        super(name);
        this.id = otherType.id;
        this.alias = otherType;
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
    static Types = {
        I32: new Primitive(),
        I64: new Primitive(),
        F32: new Primitive(),
        F64: new Primitive(),
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

module.exports = {
    UserType,
    Primitive,
    Union,
    Struct,
    Alias,
};