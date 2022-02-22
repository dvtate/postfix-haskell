import { LexerToken } from './scan';
import { Value } from './value';

/**
 * Abstract base for datatypes
 */
export abstract class Type {
    token: LexerToken;

    /**
     * @param {LexerToken} [token] -
     */
    constructor(token: LexerToken = undefined) {
        this.token = token;
    }

    /**
     * Gives type that class refers to
     * @returns - Underlying datatype
     * @virtual
     */
    // TODO rename to 'dropClasses'
    getBaseType(): Type { return this; }

    /**
     * Remove references
     * @returns underlying datatype
     * @virtual
     */
    dropRefs(): Type { return this; }

    /**
     * Gives the wasm typename for given type
     * @returns - typename
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
     * @returns false if the value doesn't carry a value
     * @virtual
     */
    isUnit(): boolean {
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

    /**
     * Returns true if type contains a wildcard
     * @virtual
     */
    isWild(): boolean {
        return true;
    }
}

/**
 * Type which matches any other type
 */
export class AnyType extends Type {}

/**
 * More specific than types, used for applying methods and stuff
 */
export class ClassType<T extends Type> extends Type {
    /**
     * Base type
     */
    type: T;

    /**
     * Unique identifier for the class
     */
    id: number;
    static _uid = 0;

    /**
     * @param token - code where
     * @param type - Underlying Data type
     * @param [id] - Clone a class
     */
    constructor(token: LexerToken, type: T, id: number = ClassType._uid++) {
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
     * @returns - list of class ids for this type
     */
    getClassIds(): number[] {
        const ret = [this.id];
        let type = this.type;
        while (type instanceof ClassType) {
            ret.push(type.id);
            type = type.type;
        }
        return ret;
    }

    /**
     * @override
     */
    isUnit() {
        return this.getBaseType().isUnit();
    }

    /**
     * @override
     */
    isWild() {
        return this.getBaseType().isWild();
    }
}

/**
 * When need to be able to handle more than one type
 *  aka sum type (`|`)
 */
export class UnionType extends Type {
    types: Type[];

    constructor(token: LexerToken = undefined, types: Type[] = []) {
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
    getWasmTypeName() {
        return 'invalid union type';
    }
}

/**
 * When need to store more than one piece of data in a single value
 *  aka product type (`pack`)
 */
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
    isUnit(): boolean {
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

    /**
     * @override
     */
    isWild() {
        return this.types.some(t => t.isWild());
    }
}

/**
 * Type that's a component of compilation target
 */
export class PrimitiveType extends Type {
    name: string;

    // Map of WASM primitive types
    static Types: { [k: string]: PrimitiveType } = {
        I32: new PrimitiveType('i32'),
        I64: new PrimitiveType('i64'),
        F32: new PrimitiveType('f32'),
        F64: new PrimitiveType('f64'),
    };

    /**
     * @param name - formal name for type in target spec
     */
    constructor(name: string) {
        super();
        this.name = name;
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

    /**
     * @override
     */
    isWild() {
        return false;
    }
}

/**
 * Datatype to describe function/macros
 */
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
        return this.inputTypes.every((t, i) => t.check(type.inputTypes[i]))
            && this.outputTypes.every((t, i) => t.check(type.outputTypes[i]));
    }

    /**
     * Can this arrow be called with the given stack?
     * @param stack stack to check from
     * @returns true if types align
     */
    checkInputs(stack: Value[]): boolean {
        if (this.inputTypes.length === 0)
            return true;
        return stack.length >= this.inputTypes.length
            && stack
                .slice(-this.inputTypes.length)
                .every((v, i) => v.datatype && this.inputTypes[i].check(v.datatype));
    }

    checkInputTypes(types: Type[]): boolean {
        if (this.inputTypes.length === 0)
            return true;
        return types.length >= this.inputTypes.length
            && types
                .slice(-this.inputTypes.length)
                .every((t, i) => this.inputTypes[i].check(t));
    }

    /**
     * @override
     */
    isWild() {
        return this.inputTypes.some(t => t.isWild())
            || this.outputTypes.some(t => t.isWild());
    }
}

/**
 * Reference for a value of a given type T
 */
export class RefType<T extends Type> extends Type {
    /**
     * @param token location in source code
     * @param type type of value being referenced
     */
    constructor(token: LexerToken, public type: T) {
        super(token);
    }

    /**
     * @override
     */
    check(type: Type): boolean {
        return this.type.check(type);
    }

    /**
     * @override
     */
    dropRefs(): Type {
        // I don't think it makes sense for language to support referencing a reference type tbh
        if (this.type instanceof RefType)
            return this.type.dropRefs();
        return this.type;
    }

    /**
     * @override
     */
    getBaseType(): Type {
        // Drop classes from the referenced type
        return new RefType(this.token, this.type.getBaseType());
    }

    /**
     * @override
     */
    getWasmTypeName(name?: string): string {
        // i32 = pointer type
        return 'i32';
    }
}