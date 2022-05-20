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
    abstract getBaseType(): Type;

    /**
     * Gives the wasm typename for given type
     * @returns - typename
     * @virtual
     */
    abstract getWasmTypeName(name?: string): string;

    /**
     * Get a flat list of primitive types that constitute this type
     * @returns list of primitives that this type compiles to
     * @throws if union encountered throws string "union"
     * @virtual
     */
    abstract flatPrimitiveList(): Array<PrimitiveType | RefType<Type> | RefRefType<RefType<Type>>>;

    /**
     * Does this type hold a value in wasm?
     * @returns false if the value doesn't carry a value
     * @virtual
     */
    abstract isUnit(): boolean;

    /**
     * Do Typecheck
     * @param {Type} type - type to check against
     * @virtual
     */
    abstract check(type : Type): boolean;
}

/**
 * Type which matches any other type
 */
export class AnyType extends Type {

    /**
     * @override
     */
    getBaseType(): Type {
        return this;
    }

    /**
     * @override
     */
    getWasmTypeName(name?: string): string {
        throw new Error('Invalid call: AnyType.getWasmTypeName');
    }

    /**
     * @override
     */
    flatPrimitiveList(): Array<PrimitiveType | RefType<Type> | RefRefType<RefType<Type>>> {
        throw new Error('Invalid call: AnyType.flatPrimitiveList');
    }

    /**
     * @override
     */
    isUnit(): boolean {
        return true;
    }

    /**
     * @override
     */
    check(type: Type): boolean {
        // Default behavior is to act as a wildcard
        return type != null;
    }
}

/**
 * Type which never matches
 */
export class NeverType extends Type {
    /**
     * @override
     */
    getBaseType(): Type {
        return this;
    }
    getWasmTypeName(name?: string): string {
        throw Error('Invalid call: NeverType.getWasmTypeName');
    }
    flatPrimitiveList(): (PrimitiveType | RefType<Type> | RefRefType<RefType<Type>>)[] {
        throw Error('Invalid call: NeverType.flatPrimitiveList');
    }
    isUnit(): boolean {
        return true;
    }
    check(type: Type): boolean {
        return false;
    }
}

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
    // TODO instead use a map from Tokens to ids ?
    id: number;
    static _tokenIdMap: Map<LexerToken, number> = new Map();

    /**
     * @param token - code where
     * @param type - Underlying Data type
     * @param [id] - Clone a class
     */
    constructor(token: LexerToken, type: T, id?: number) {
        super(token);
        this.type = type;
        this.id = id === undefined ? genId() : id;

        function genId() {
            // Already in the map
            const id = ClassType._tokenIdMap.get(token);
            if (id !== undefined)
                return id;

            // Add to map
            const newId = ClassType._tokenIdMap.size;
            ClassType._tokenIdMap.set(token, newId);
            return newId;
        }
    }

    /**
     * @override
     */
    check(type: Type): boolean {
        if (type === null)
            return false;

        // Check class
        if (type instanceof ClassType) {
            // TODO alternatively we can check if tokens align and then verify data schema
            // Check if subclass
            if (!type.getClassIds().includes(this.id))
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
    flatPrimitiveList() {
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

        if (type instanceof AnyType)
            return true;
        if (type instanceof NeverType)
            return false;

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
    getWasmTypeName(): string {
        throw new Error('Invalid call: UnionType.getWasmTypeName()');
    }
    isUnit(): boolean {
        throw new Error("Invalid call: UnionType.isUnit()");
    }
    getBaseType(): Type {
        return this;
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
    flatPrimitiveList() {
        return this.types
            .map(t => t.flatPrimitiveList())
            .reduce((a,b) => a.concat(b), []);
    }

    /**
     * @override
     */
    check(type: Type): boolean {
        if (type == null)
            return false;

        // Always match Any
        if (type instanceof AnyType)
            return true;

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

    getBaseType(): Type {
        return this;
    }
}

/**
 * Tuple type but with no elements
 */
export class UnitType extends TupleType {
    types: []
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
        if (type instanceof AnyType)
            return true;

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
    isUnit(): boolean {
        return false;
    }
    getBaseType(): Type {
        return this;
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
        if (type instanceof AnyType)
            return true;
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
    flatPrimitiveList(): (PrimitiveType | RefType<Type> | RefRefType<RefType<Type>>)[] {
        throw new Error('Invalid call: ArrowType.flatPrimitiveList()');
    }
    isUnit(): boolean {
        return false;
    }
    getBaseType(): Type {
        return this;
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
        if (type instanceof AnyType)
            return true;
        // Interchangeable with base type
        return this.type.check(type);
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
        // TODO think
        // NOTE the object is on ref_stack and only used only indirectly there
        // i32 = pointer type
        return '';
    }

    flatPrimitiveList(): RefType<TupleType>[] {
        return [new RefType(this.token,
            new TupleType(this.token,
                this.type.flatPrimitiveList()))];
    }

    /**
     * Determines if objects of this type need to be stored on separate stack or not
     * @returns true if the type contains reference fields
     */
    hasRefs(): boolean {
        const bt = this.type.getBaseType();
        if (bt instanceof UnionType)
            return bt.types.some(t => t instanceof RefType || t instanceof RefRefType)
        // TODO arrow types, scary
        return false;
    }

    isUnit(): boolean {
        // It makes no sense for us to have a reference to a unit value
        return false; // this.type.isUnit();
    }
}

/**
 * Reference to a pointer which is stored on rv_stack to an object managed by gc
 */
export class RefRefType<T extends RefType<Type>> extends Type {
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
        if (type instanceof AnyType)
            return true;
        // Interchangeable with base type
        return this.type.check(type);
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
        // TODO think
        // NOTE the object is on ref_stack and only used only indirectly there
        // i32 = pointer type
        return '';
    }

    flatPrimitiveList() {
        // Note that we return empty arr here because the value is stored on the ref/rv stack
        return [
            new RefRefType(this.token,
                new RefType(this.token,
                    new TupleType(this.token,
                        this.type.flatPrimitiveList())))];
    }
    isUnit(): boolean {
        return false;
    }
}

/**
 * Matches anything within same enum type
 */
export class EnumBaseType extends Type {
    /**
     * Enum members defined by this class
     */
    constructor(
        token: LexerToken,
        public subtypes: { [k: string]: EnumClassType }
    ) {
        super(token);
        Object.values(this.subtypes).forEach((t, i) => {
            t.parent = this;
            t.index = i;
        });
    }

    /**
     * @override
     */
    check(type: Type): boolean {
        if (type instanceof AnyType)
            return true;
        return type && this.token === type.token;
    }
    isUnit(): boolean {
        return Object.values(this.subtypes).every(t => t.isUnit());
    }
    flatPrimitiveList(): (PrimitiveType | RefType<Type> | RefRefType<RefType<Type>>)[] {
        // Is this right?
        return [PrimitiveType.Types.I32, PrimitiveType.Types.I32];
    }
    getWasmTypeName(name?: string): string {
        // Is this right?
        return 'i32 i32';
    }
    getBaseType(): Type {
        return this;
    }
}

/**
 * Matches class defined within an enum
 */
export class EnumClassType extends Type {
    /**
     * Metadata associating this class with the parent
     */
    parent: EnumBaseType;
    index: number;

    constructor(token: LexerToken, public type: ClassType<Type>) {
        super(token);
    }

    /**
     * @override
     */
    check(type: Type): boolean {
        if (type instanceof AnyType)
            return true;
        return type instanceof EnumClassType
            && this.token === type.token    // also implies same parent
            && this.type.check(type.type);
    }
    isUnit(): boolean {
        return this.type.isUnit();
    }
    flatPrimitiveList(): (PrimitiveType | RefType<Type> | RefRefType<RefType<Type>>)[] {
        // Is this right?
        return [PrimitiveType.Types.I32, PrimitiveType.Types.I32];
    }
    getWasmTypeName(name?: string): string {
        // Is this right?
        return 'i32 i32';
    }
    getBaseType(): Type {
        return this.type.getBaseType();
    }
}