
// Abstract Base class
class Type { };

// More specific than types, used for applying methods and stuff
class ClassType extends Type {
    static _uid = 0;
    /**
     * @param {LexerToken} token - code where
     * @param {Type} type - Underlying Data type
     */
    constructor(token, type) {
        super();
        this.token = token;
        this.id = ClassType._uid++;
        this.type = type;
    }

    /**
     * Verify compatible type
     * @param {Type} type - Type to check against
     */
    check(type) {
        // Check class
        if (type instanceof ClassType) {
            // Check compatible class
            const otherClasses = type.getClassIds();
            const classMatch = this.getClassIds().some(id => otherClasses.includes(id));
            if (!classMatch)
                return false;

            // Check data schema
            if (!this.type)
                return true;
            return this.getBaseType().check(type);
        }

        // Expected a class
        return false;
    }

    /**
     * @returns {Type} - Underlying datatype
     */
    getBaseType() {
        let ret = this.type;
        while (ret instanceof ClassType)
            ret = ret.type;
        return ret;
    }

    /**
     * @returns {Number[]} - list of class ids for this type
     */
    getClassIds() {
        const ret = [this.id];
        let type = this.type;
        while (type instanceof ClassType) {
            ret.push(type.id);
            type = type.type;
        }
        return ret;
    }
};

// When need to be able to handle more than one type
//  Used for types resulting from `|` operator
class UnionType extends Type {
    /**
     * @param {Type[]} types
     */
    constructor(token = null, types = []) {
        super();
        this.token = token;
        this.types = types;
    }

    /**
     * Verify compatible type
     * @param {Type} type
     */
    check(type) {
        // Don't care about classes
        if (type instanceof ClassType) {
            type = type.getBaseType();
            if (!type)
                return false;
        }

        // Verify other union is subset of this one
        if (type instanceof UnionType)
            return type.types.every(t => this.types.includes(t));

        // Verify type is in this set
        return this.types.includes(type);
    }
};

// When need to store more than one piece of data in a single value
//  Used for types resulting from `pack` operator
class TupleType {
    /**
     * @param {Type[]} types
     */
    constructor(token = null, types = []) {
        super();
        this.token = token;
        this.types = types;
    }

    /**
     * Verify compatible type
     * @param {Type} type
     */
    check(type) {
        // Don't care about classes
        if (type instanceof ClassType) {
            type = type.getBaseType();
            if (!type)
                return false;
        }

        // Not a tuple
        if (!(type instanceof TupleType))
            return false;

        // Different size
        if (this.types.length !== other.types.length)
            return false;

        // Verify types match
        for (let i = 0; i < this.types.length; i++)
            if (!this.types[i].check(other.types[i]))
                return false;
        return true;
    }
};

// Type that's a component of compilation target
class PrimitiveType extends Type {
    /**
     * @param {String} name - formal name for type in target spec
     */
    constructor(name) {
        super();
        this.name = name;
    }

    // Map of WASM primitive types
    static Types = {
        I32: new PrimitiveType('I32'),
        I64: new PrimitiveType('I64'),
        F32: new PrimitiveType('F32'),
        F64: new PrimitiveType('F64'),
    };

    /**
     * @param {Type} type - type to check against
     */
    check(type) {
        // Don't care about classes
        if (type instanceof ClassType) {
            type = type.getBaseType();
            if (!type)
                return false;
        }

        // All instances of PrimitiveType will be in the static Types map
        return this == type;
    }
};

module.exports = { Type, ClassType, UnionType, TupleType, PrimitiveType };