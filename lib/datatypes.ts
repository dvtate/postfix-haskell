import { IdToken, LexerToken } from './scan.js';
import { Value, ValueType } from './value.js';
import WasmNumber from './numbers.js';
import * as error from './error.js';

/**
 * Some methods available on types representable on hardware
 */
interface DataTypeInterface {
    // See documentation in DataType
    flatPrimitiveList(): Array<PrimitiveType | RefType<DataType>>;
    getWasmTypeName(name?: string): string;
    isUnit(): boolean;
}

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
     * Do Typecheck
     * @param {Type} type - type to check against
     * @virtual
     */
    abstract check(type : Type): boolean;

    /**
     * Pretty print
     */
    abstract toString(): string;
}

/**
 * Type which matches any other type
 */
export class AnyType extends Type implements DataTypeInterface {
    /**
     * @override
     */
    check(): boolean {
        return true;
    }
    flatPrimitiveList(): PrimitiveType[] {
        throw new error.SyntaxError('AnyType can only exist at compile-time', [this.token]);
    }
    getWasmTypeName(): string {
        throw new error.SyntaxError('AnyType can only exist at compile-time', [this.token]);
    }
    isUnit(): boolean {
        throw new error.SyntaxError('AnyType can only exist at compile-time', [this.token]);
    }
    toString(): string {
        return "Any";
    }
}

/**
 * Type which never matches
 */
export class NeverType extends Type implements DataTypeInterface {
    /**
     * @override
     */
    check(): boolean {
        return false;
    }
    flatPrimitiveList(): PrimitiveType[] {
        throw new error.SyntaxError('NeverType can only exist at compile-time', [this.token]);
    }
    getWasmTypeName(): string {
        throw new error.SyntaxError('NeverType can only exist at compile-time', [this.token]);
    }
    isUnit(): boolean {
        throw new error.SyntaxError('NeverType can only exist at compile-time', [this.token]);
    }
    toString(): string {
        return "Never";
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

    flatPrimitiveList(): PrimitiveType[] {
        throw new error.SyntaxError('UnionType can only exist at compile-time', [this.token]);
    }
    getWasmTypeName(): string {
        throw new error.SyntaxError('UnionType can only exist at compile-time', [this.token]);
    }
    isUnit(): boolean {
        throw new error.SyntaxError('UnionType can only exist at compile-time', [this.token]);
    }
    toString(): string {
        let ret = this.types[0].toString();
        for (let i = 1; i < this.types.length; i++)
            ret += ` ${this.types[i].toString()} |`;
        return ret;
    }
}

/**
 * Syntactic types
 */
// TODO probably could use singletons for each valuetype
export class SyntaxType extends Type {
    /**
     * @param token location in code
     * @param valueType relevant syntactic/value type
     */
    protected constructor(token: LexerToken, public valueType: ValueType) {
        super(token);
    }

    static ValueTypes = {
        [ValueType.Macro]: new SyntaxType(new IdToken('Syntax:Macro', 0, undefined), ValueType.Macro),
        [ValueType.Data]: new SyntaxType(new IdToken('Syntax:Data', 0, undefined), ValueType.Data),
        [ValueType.Type]: new SyntaxType(new IdToken('Syntax:Type', 0, undefined), ValueType.Type),
        [ValueType.Id]: new SyntaxType(new IdToken('Syntax:Id', 0, undefined), ValueType.Id),
        [ValueType.Expr]: new SyntaxType(new IdToken('Syntax:Expr', 0, undefined), ValueType.Expr),
        [ValueType.Fxn]: new SyntaxType(new IdToken('Syntax:Fxn', 0, undefined), ValueType.Fxn),
        [ValueType.Str]: new SyntaxType(new IdToken('Syntax:Str', 0, undefined), ValueType.Str),
        [ValueType.Ns]: new SyntaxType(new IdToken('Syntax:Ns', 0, undefined), ValueType.Ns),
        [ValueType.EnumNs]: new SyntaxType(new IdToken('Syntax:EnumNs', 0, undefined), ValueType.EnumNs),
        [ValueType.EnumK]:  new SyntaxType(new IdToken('Syntax:EnumK', 0, undefined), ValueType.EnumK),
    };

    /**
     * @override
     */
    check(type: Type): boolean {
        // Drop classes
        if (type instanceof ClassType)
            type = type.getBaseType();
        if (type instanceof SyntaxType)
            return type.valueType === this.valueType;

        // Note: don't allow classes of syntax types?
        return false;
    }

    /**
     * @overrride
     */
    toString(): string {
        return 'Syntax:' + ValueType[this.valueType];
    }
}

/**
 * Types of entities that can be physically represented
 */
export abstract class DataType extends SyntaxType implements DataTypeInterface {
    // declare valueType: ValueType.Data;

    constructor(token: LexerToken) {
        super(token, ValueType.Data);
    }

    // TODO this only really makes sense for tuples and classes of them...
    /**
     * Get a flat list of primitive types that constitute this type
     * @returns list of primitives that this type compiles to
     * @throws if union encountered throws string "union"
     * @virtual
     */
    abstract flatPrimitiveList(): Array<PrimitiveType | RefType<DataType>>;

    /**
     * Gives the wasm typename for given type
     * @returns - typename
     * @virtual
     */
    getWasmTypeName(name?: string): string {
        return this.flatPrimitiveList().map(t => t instanceof PrimitiveType ? t.name : 'i32').join(' ');
    }

    /**
     * Does this type hold a value in wasm?
     * @returns false if the value doesn't carry a value
     * @virtual
     */
    isUnit(): boolean {
        return this.flatPrimitiveList().length === 0;
    }
}

/**
 * More specific than types, used for applying methods and stuff
 */
export class ClassType<T extends DataType> extends DataType {
    /**
     * Base type
     */
    declare type: T;

    /**
     * Unique identifier for each class
     */
    id: number;
    static _tokenIdMap: Map<LexerToken, number> = new Map();

    /**
     * @param token - Code where
     * @param type - Underlying Data type
     * @param [id] - Clone a class
     */
    constructor(token: LexerToken, type: T, id?: number, public recursive: boolean = false) {
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
     * Gives type that class refers to
     * @returns - Underlying datatype
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

    toString(): string {
       return `${this.type.toString()} ${this.id} #class`;
    }

    // /**
    //  * Does an object of this type need to be stored on the heap?
    //  */
    // isRecursive(): boolean {
    //     return this.recursive
    //     || (this.type instanceof ClassType && this.type.isRecursive());
    // }
}

/**
 * Type T or class of type T
 */
export type ClassOrType<T extends DataType> = T | ClassType<ClassOrType<T>>;

/**
 * When need to store more than one piece of data in a single value
 *  aka product type (`pack`)
 */
export class TupleType extends DataType {
    /**
     * @param token location in code
     * @param types member types
     */
    constructor(token: LexerToken = undefined, public types: Type[] = []) {
        super(token);
    }

    /**
     * Returns an error if type contains compile-time-only member types
     */
    assertIsDataType(): void | error.SyntaxError {
        const t = this.types.find(t => !(t instanceof DataType));
        if (t)
            return new error.SyntaxError('Unexpected compile-only type', [t.token, this.token]);
    }

    // /**
    //  * @override
    //  */
    // getWasmTypeName(name?: string) {
    //     const err = this.assertIsDataType();
    //     if (err)
    //         throw err;

    //     return (this.types as DataType[]).map(t => t.getWasmTypeName(name)).join(' ');
    // }

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
        const err = this.assertIsDataType();
        if (err)
            throw err;

        return (this.types as DataType[])
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

    toString(): string {
        if (this.types.length === 0)
            return 'Unit';
        return `( ${this.types.map(t => t.toString()).join(' ')} )`;
    }
}

/**
 * Type that's a component of compilation target
 */
export class PrimitiveType extends DataType {
    name: string;

    // Map of WASM primitive types
    static Types: { [k: string]: PrimitiveType } = {
        I32: new PrimitiveType('i32'),
        I64: new PrimitiveType('i64'),
        F32: new PrimitiveType('f32'),
        F64: new PrimitiveType('f64'),
    };

    static typeMap = {
        [WasmNumber.Type.I32]: PrimitiveType.Types.I32,
        [WasmNumber.Type.I64]: PrimitiveType.Types.I64,
        [WasmNumber.Type.F32]: PrimitiveType.Types.F32,
        [WasmNumber.Type.F64]: PrimitiveType.Types.F64,
        // TODO add these
        [WasmNumber.Type.U32]: PrimitiveType.Types.I32,
        [WasmNumber.Type.U64]: PrimitiveType.Types.I64,
    };

    /**
     * @param name - formal name for type in target spec
     */
    private constructor(name: string) {
        super(undefined);
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
    toString(): string {
        return this.name.toUpperCase();
    }
}

/**
 * Datatype to describe function/macros
 */
export class ArrowType extends DataType {
    constructor(
        token: LexerToken,
        public inputTypes: Type[],
        public outputTypes?: Type[]
    ) {
        super(token);
    }

    /**
     * @override
     */
    getWasmTypeName(name?: string) {
        // Make sure it's valid compile-time type
        const badInp = this.inputTypes.find(t => !(t instanceof DataType));
        if (badInp)
            throw new error.SyntaxError('One of the input types is compile-time only', [badInp.token, this.token]);
        if (!this.outputTypes)
            throw new error.SyntaxError('Partial Arrow type used in wrong context', [this.token]);
        const badOut = this.outputTypes.find(t => !(t instanceof DataType));
        if (badOut)
            throw new error.SyntaxError('One of the input types is compile-time only', [badOut.token, this.token]);

        return `(func ${name} (param ${
            (this.inputTypes as DataType[]).map(t => t.getWasmTypeName()).join(' ')
        }) (result ${
            (this.outputTypes as DataType[]).map(t => t.getWasmTypeName()).join(' ')
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
            && (!this.outputTypes || this.outputTypes.every((t, i) => t.check(type.outputTypes[i])));
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
    flatPrimitiveList(): (PrimitiveType | RefType<DataType>)[] {
        throw new Error('Invalid call: ArrowType.flatPrimitiveList()');
    }
    isUnit(): boolean {
        return false;
    }
    toString(): string {
        const inpTypes = this.inputTypes.map(t => t.toString()).join(' ');
        const outTypes = this.outputTypes.map(t => t.toString()).join(' ');
        return `( ${inpTypes} ) ( ${outTypes} ) Arrow`;
    }
}

/**
 * Reference for a value of a given type T
 *
 * Pointer stored on gc value stack, points to value in heap
 *
 * see: planning/brainstorm/ref_stack_vars.md
 */
export class RefType<T extends DataType> extends DataType {
    /**
     * @param token location in source code
     * @param type type of value being referenced
     * @param offsetBytes When accessing a member of an object need to use reference
     */
    constructor(token: LexerToken, public type: T, public offsetBytes = 0) {
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
    getWasmTypeName(): string {
        return 'i32';
    }

    /**
     * Prevent recursive calls to RefType.flatPrimitiveList()
     *
     * @remarks Correct solution would be to pass an argument but that's ugly
     */
    private static noRecFlatPrimitiveList = false;

    /**
     * @override
     */
    flatPrimitiveList(): RefType<DataType>[] {
        // TODO this is bad, should just be [I32]
        // This should just give i32. For caller to get this functionality they should have to call this.type.flatPrimitiveList()
        let offset = 0;
        if (!RefType.noRecFlatPrimitiveList) {
            RefType.noRecFlatPrimitiveList = true;
            this.type.flatPrimitiveList().map(t => {
                const oldOffset = offset;
                if (t instanceof PrimitiveType)
                    switch ((t as PrimitiveType).name) {
                        case 'i32': case 'f32': offset += 4; break;
                        case 'i64': case 'f64': offset += 8; break;
                        default: throw new Error('wtf?');
                    }
                else {
                    // Otherwise it's a reference
                    offset += 4;
                    console.log('RefType.fpl(): other type: ', t);
                }
                return new RefType(this.token, t, oldOffset);
            });
            RefType.noRecFlatPrimitiveList = false;
        }

        return [this];
    }

    /**
     * Determines if objects of this type need to be stored on separate stack or not
     * @returns true if the type contains reference fields
     */
    hasRefs(): boolean {
        const bt = this.type instanceof ClassType ? this.type.getBaseType() : this.type;
        if (bt instanceof UnionType)
            return bt.types.some(t => t instanceof RefType || t instanceof RefRefType)
        // TODO arrow types, scary
        return false;
    }

    isUnit(): boolean {
        // It makes no sense for us to have a reference to a unit value
        return false; // this.type.isUnit();
    }

    toString(): string {
        return this.type.toString() + " Ref";
    }
}

/**
 * Reference to a pointer which is stored on rv_stack to an object managed by gc
 *
 * Stored in wasm locals, point to location on, gc rv stack, where lie pointers to objects on the heap
 *
 * see: planning/brainstorm/ref_stack_vars.md
 *
 * @depricated - I feel like conversion should be implicit
 */
export class RefRefType<T extends DataType> extends DataType {
    /**
     * @param token location in source code
     * @param type type of value being referenced
     * @param offsetBytes When accessing a member of an object need to use reference
     */
    constructor(token: LexerToken, public type: T, public offsetBytes = 0) {
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
    getWasmTypeName(): string {
        return 'i32';
    }

    flatPrimitiveList(): RefType<DataType>[] {
        // TODO this is bad, should just be [I32]
        let offset = 0;
        return this.type.flatPrimitiveList().map(t => {
            const oldOffset = offset;
            if (t instanceof PrimitiveType)
                switch (t.name) {
                    case 'i32': case 'f32': offset += 4; break;
                    case 'i64': case 'f64': offset += 8; break;
                    default: throw new Error('wtf?');
                }
            else
                // Otherwise it's a pointer
                offset += 4;

            return new RefType(this.token, t, oldOffset);
        });
    }

    isUnit(): boolean {
        return false;
    }
    toString(): string {
        return this.type.toString() + " Ptr";
    }
}

/**
 * Matches anything within same enum type
 */
export class EnumBaseType extends DataType {
    /**
     * @param subtypes Enum members defined by this class
     */
    constructor(
        token: LexerToken,
        public subtypes: { [k: string]: EnumClassType<any> }
    ) {
        super(token);
        Object.entries(this.subtypes).forEach(([sym, t], i) => {
            t.parent = this;
            t.index = i;
            t.name = sym;
        });
    }

    /**
     * @override
     */
    check(type: Type): boolean {
        // Any type
        if (type instanceof AnyType)
            return true;

        // Drop classes
        if (type instanceof ClassType)
            type = type.getBaseType();
        if (!type)
            return false;

        // Yikes
        const isChild = () => Object.values(this.subtypes).some(t => t.check(type));
        const isCompat = () => type instanceof EnumBaseType
            && this.token === type.token
            && Object.keys(this.subtypes).length === Object.keys(type.subtypes).length
            && Object.values(this.subtypes).every(t => t.check(type));
        return type && (this === type || isChild() || isCompat());
    }
    isUnit(): boolean {
        // return Object.values(this.subtypes).every(t => t.isUnit());
        return false;
    }
    flatPrimitiveList(): (PrimitiveType | RefType<DataType>)[] {
        // Is this right?
        return [PrimitiveType.Types.I32, PrimitiveType.Types.I32];
    }
    getWasmTypeName(): string {
        // type index + ref address
        return 'i32 i32';
    }
    getBaseType(): Type {
        return this;
    }
    toString(): string {
        return `(:\n${
            Object.entries(this.subtypes).map(([sym, t]) => `${t.toString()} $${sym} =`).join('\n')
        }\n) enum`
    }

    sortedSubtypes() {
        return Object.values(this.subtypes).sort((a, b) => a.index - b.index);
    }
}

/**
 * Matches class defined within an enum
 */
// TODO maybe shouldn't extend ClassType?
export class EnumClassType<T extends DataType> extends ClassType<T> {
    /**
     * Metadata associating this class with the parent
     */
    parent: EnumBaseType;
    index: number;

    constructor(token: LexerToken, type: T, public name: string, id?: number) {
        super(token, type, id);
    }

    /**
     * @override
     */
    check(type: Type): boolean {
        // Wildcard type
        if (type instanceof AnyType)
            return true;

        // Drop classes
        if (type instanceof ClassType)
            type = type.getBaseType();
        if (!type)
            return false;


        if (type === this.parent)
            return true;
        return type instanceof EnumClassType
            && this.token === type.token    // corrolaries: same parent, same class id
            && this.index === type.index
            && this.type.check(type.type);
    }
    isUnit(): boolean {
        return false;
    }
    flatPrimitiveList(): (PrimitiveType | RefType<DataType>)[] {
        // Is this right?
        return [PrimitiveType.Types.I32, PrimitiveType.Types.I32];
    }
    getWasmTypeName(): string {
        // Is this right?
        // type index + ref address
        return 'i32 i32';
    }
    toString(): string {
        return `${super.toString()} ${this.name}#${this.index}_enum`;
    }
}