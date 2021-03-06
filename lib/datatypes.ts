import { LexerToken } from './scan';

// TODO depict function/method

// Abstract Base class
export class Type {
    token: LexerToken;

    /**
     * @param {LexerToken} [token] -
     */
    constructor(token: LexerToken = undefined) {
        this.token = token;
    }

    /**
     * Gives type that class refers to
     * @returns {Type} - Underlying datatype
     * @virtual
     */
    getBaseType(): Type { return this; }

    /**
     * Gives the wasm typename for given type
     * @returns {sting} - typename
     * @virtual
     */
    getWasmTypeName(name?: string): string { return ''; }

    /**
     * Get a flat list of primitive types that constitute this type
     * @returns list of primitives that this type compiles to
     * @throws if union encountered throws string "union"
     */
    flatPrimitiveList(): PrimitiveType[] {
        return [];
    }

    /**
     * Does this type hold a value in wasm?
     */
     isVoid(): boolean {
        return false;
    }

    /**
     * Do Typecheck
     * @param {Type} type - type to check against
     * @virtual
     */
    check(type : Type): boolean {
        // Default behavior is to act as a wildcard
        return type != null;
    }
};

// More specific than types, used for applying methods and stuff
export class ClassType extends Type {
    type: Type;
    id: number;

    // Unique ids
    static _uid = 0;

    /**
     * @param {LexerToken} token - code where
     * @param {Type} type - Underlying Data type
     */
    constructor(token: LexerToken, type: Type, id: number = ClassType._uid++) {
        super(token);
        this.type = type;
        this.id = id;
    }

    /**
     * @override
     */
    check(type: Type):boolean {
        if (type === null)
            return false;

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
    flatPrimitiveList(): PrimitiveType[] {
        return this.getBaseType().flatPrimitiveList();
    }

    /**
     * @override
     */
    getWasmTypeName(name?: string) {
        return this.getBaseType().getWasmTypeName(name);
    }

    /**
     * @returns {Number[]} - list of class ids for this type
     */
    getClassIds(): Number[] {
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
export class UnionType extends Type {
    types: Type[];

    constructor(token: LexerToken = undefined, types = []) {
        super(token);
        this.types = types;
    }

    /**
     * @override
     */
    check(type: Type): boolean {
        if (type === null)
            return false;

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
    flatPrimitiveList(): PrimitiveType[] {
        throw "union type";
    }

    /**
     * @override
     */
    getWasmTypeName(name?: string) {
        return 'invalid union type';
    }
};

// When need to store more than one piece of data in a single value
//  Used for types resulting from `pack` operator
export class TupleType extends Type {
    types: Type[];

    constructor(token: LexerToken = undefined, types: Type[] = []) {
        super(token);
        this.types = types;
    }

    /**
     * @override
     */
    getWasmTypeName(name?: string) {
        return this.types.map(t => t.getWasmTypeName(name)).join(' ');
    }

    /**
     * @override
     */
    isVoid(): boolean {
        return this.types.length === 0;
    }

    /**
     * @override
     */
    flatPrimitiveList(): PrimitiveType[] {
        return this.types
            .map(t => t.flatPrimitiveList())
            .reduce((a,b) => a.concat(b));
    }

    /**
     * @override
     */
    check(type: Type): boolean {
        if (type == null)
            return false;

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
export class PrimitiveType extends Type {
    name: string;

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
    constructor(name: string) {
        super();
        this.name = name;
    }

    /**
     * @override
     */
    getWasmTypeName(name?: string) {
        return this.name;
    }

    /**
     * @override
     */
    check(type: Type): boolean {
        if (type == null)
            return false;

        // Don't care about classes
        if (type instanceof ClassType) {
            type = type.getBaseType();
            if (!type)
                return false;
        }

        // All instances of PrimitiveType will be in the static Types map
        return this == type;
    }


    /**
     * @override
     */
    flatPrimitiveList(): PrimitiveType[] {
        return [this]
    }
};

// Datatype to describe function/macros
export class ArrowType extends Type {
    constructor(token: LexerToken,
        public inputTypes: Type[],
        public outputTypes: Type[])
    {
        super(token);
    }

    /**
     * @override
     */
    getWasmTypeName(name?: string) {
        return `(func ${name} (param ${
            this.inputTypes.map(t => t.getWasmTypeName()).join(' ')
        }) (result ${
            this.outputTypes.map(t => t.getWasmTypeName()).join(' ')
        }))`;
    }

    /**
     * @override
     */
    check(type: Type): boolean {
        if (!(type instanceof ArrowType))
            return false;
        return !(this.inputTypes.some((t, i) => t.check(type.inputTypes[i]))
            || this.outputTypes.some((t, i) => t.check(type.outputTypes[i])));
    }
};


// TODO add ValueTypes as classes?