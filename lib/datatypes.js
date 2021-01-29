
// Abstract Base class
class Type {
    /**
     * @param {Token} [token] -
     */
    constructor(token) {
        this.token = token;
    }

    /**
     * Gives type that class refers to
     * @returns {Type} - Underlying datatype
     * @virtual
     */
    getBaseType() { return this; }

    /**
     * Gives the wasm typename for given type
     * @returns {sting} - typename
     * @virtual
     */
    getWasmTypeName() { return ''; }

    /**
     * Do Typecheck
     * @param {Type} type - type to check against
     * @virtual
     */
    check() {
        // Default behavior is to act as a wildcard
        return true;
    }
};

// More specific than types, used for applying methods and stuff
class ClassType extends Type {
    static _uid = 0;
    /**
     * @param {LexerToken} token - code where
     * @param {Type} type - Underlying Data type
     */
    constructor(token, type, id = null) {
        super(token);
        this.type = type;
        this.id = id === null ? ClassType._uid++ : id;
    }

    /**
     * @returns {ClassType} - Cloned class type
     */
    clone() {
        return new ClassType(this.token, this.type, this.id);
    }

    /**
     * @override
     */
    check(type) {
        // Check class
        if (type instanceof ClassType) {
            // Check compatible class
            const otherClasses = type.getClassIds();
            const classMatch = this.getClassIds().some(id => otherClasses.includes(id));
            // console.log('classmatch: ', classMatch);
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
     * @override
     */
    getBaseType() {
        let ret = this.type;
        while (ret instanceof ClassType)
            ret = ret.type;
        return ret;
    }

    /**
     * @override
     */
    getWasmTypeName() {
        return this.getBaseType().getWasmTypeName();
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
    constructor(token = undefined, types = []) {
        super(token);
        this.types = types;
    }

    /**
     * @returns {UnionType} - Cloned UnionType instance
     */
    clone() {
        return new UnionType(this.token, this.types);
    }

    /**
     * @override
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

    /**
     * @override
     */
    getWasmTypeName() {
        throw new Error('cannot get wasm type for a union');
    }
};

// When need to store more than one piece of data in a single value
//  Used for types resulting from `pack` operator
class TupleType extends Type {
    /**
     * @param {Type[]} types
     */
    constructor(token = undefined, types = []) {
        super(token);
        this.types = types;
    }

    /**
     * @returns {TupleType} - Cloned TupleType instance
     */
    clone() {
        return new TupleType(this.token, this.types);
    }


    /**
     * @override
     */
    getWasmTypeName() {
        return this.types.map(t => t.getWasmTypeName()).join(' ');
    }

    /**
     * @override
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
        if (this.types.length !== type.types.length)
            return false;

        // Verify types match
        for (let i = 0; i < this.types.length; i++)
            if (!this.types[i].check(type.types[i]))
                return false;
        return true;
    }
};

// Type that's a component of compilation target
class PrimitiveType extends Type {
    // Map of WASM primitive types
    static Types = {
        I32: new PrimitiveType('i32'),
        I64: new PrimitiveType('i64'),
        F32: new PrimitiveType('f32'),
        F64: new PrimitiveType('f64'),
    };

    /**
     * @param {String} name - formal name for type in target spec
     */
    constructor(name) {
        super();
        this.name = name;
    }

    /**
     * @returns {PrimitiveType} - Cloned PrimitiveType instance
     */
    clone(){
        return new PrimitiveType(this.name);
    }

    /**
     * @override
     */
    getWasmTypeName() {
        return this.name;
    }

    /**
     * @override
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

// Macro types (like lambda types)
// TODO ?
class MacroType extends Type {
    /**
     * @param {Token} token - Token for definition
     * @param {Type[]} input - Input types
     * @param {Type[]} output - Output types
     */
    constructor(token = null, input, output) {
        super(token);
        this.input = input;
        this.output = output;
    }

    /**
     * @override
     */
    check(type) {
        throw "not implemented";
    }
};

module.exports = { Type, ClassType, UnionType, TupleType, PrimitiveType, MacroType };