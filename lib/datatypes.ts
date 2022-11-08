import { IdToken, LexerToken } from './scan.js';
import { Value, ValueType } from './value.js';
import WasmNumber from './numbers.js';
import * as error from './error.js';
import Namespace from './namespace.js';

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
 * Type variables - idk might not even implement this
 * ie: (($A $A $B): ( $v1 $v2 $obj ) = "field" v1 v2 + obj JSON.withMember )
 */
export class TypeVarType extends Type implements DataTypeInterface {
    type?: Type;

    constructor(token: LexerToken, public identifier: string, public scope: object) {
        super(token);
    }

    check(type: Type): boolean {
        if (type instanceof ClassType)
            type = type.getBaseType();
        if  (!type)
            return false;
        if (type instanceof AnyType)
            return true;
        if (type instanceof TypeVarType)
            return this.identifier === type.identifier && this.scope === type.scope;
        if (this.type)
            return this.type.check(type);
        return true;
    }

    toString(): string {
        return '$' + this.identifier;
    }

    flatPrimitiveList(): (PrimitiveType | RefType<DataType>)[] {
        throw new error.SyntaxError('TypeVarType can only exist at compile-time', [this.token]);
    }
    isUnit(): boolean {
        throw new error.SyntaxError('TypeVarType can only exist at compile-time', [this.token]);
    }
    getWasmTypeName(name?: string): string {
        throw new error.SyntaxError('TypeVarType can only exist at compile-time', [this.token]);
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
// TODO when tracing this need to trace all possible types
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
        return this.types.some(t => t.check(type));
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
export class SyntaxType extends Type {
    /**
     * @param token location in code
     * @param valueType relevant syntactic/value type
     */
    protected constructor(token: LexerToken, public valueType: ValueType) {
        super(token);
    }

    /**
     * Singletons for each valuetype
     */
    static ValueTypes = {
        [ValueType.Macro]: new SyntaxType(new IdToken('Syntax:Macro', 0, undefined), ValueType.Macro),
        [ValueType.Data]: new SyntaxType(new IdToken('Syntax:Data', 0, undefined), ValueType.Data),
        [ValueType.Type]: new SyntaxType(new IdToken('Syntax:Type', 0, undefined), ValueType.Type),
        [ValueType.Id]: new SyntaxType(new IdToken('Syntax:Id', 0, undefined), ValueType.Id),
        [ValueType.Expr]: new SyntaxType(new IdToken('Syntax:Expr', 0, undefined), ValueType.Expr),
        [ValueType.Fxn]: new SyntaxType(new IdToken('Syntax:Fxn', 0, undefined), ValueType.Fxn),
        [ValueType.Str]: new SyntaxType(new IdToken('Syntax:Str', 0, undefined), ValueType.Str),
        [ValueType.Ns]: new SyntaxType(new IdToken('Syntax:Ns', 0, undefined), ValueType.Ns),
    };

    /**
     * @override
     */
    check(type: Type): boolean {
        // Drop classes
        if (type instanceof ClassType)
            type = type.getBaseType();

        // Match any
        if (type instanceof AnyType)
            return true;

        // Compare singletons
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
     * Can input/output values of this type be ignored by compiler (no value held)
     * @returns true if the value doesn't carry a value
     * @virtual
     */
    isUnit(): boolean {
        return this.flatPrimitiveList().length === 0;
    }

    /**
     * Number of i32's needed to store the described datastructure
     * @returns size in words
     */
    size(): number {
        return this.flatPrimitiveList().reduce((a, t) => a += t.size(), 0);
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
     * @param recursive - Does this class need to be stored on the heap?
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
        if (type instanceof AnyType)
            return true;

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

    /**
     * Does an object of this type need to be stored on the heap?
     */
    isRecursive(): boolean {
        return this.recursive
        || (this.type instanceof ClassType && this.type.isRecursive())
        || (this.type instanceof EnumBaseType && this.type.isRecursive())
        || (this.type instanceof EnumClassType && this.type.parent.isRecursive());
    }
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

    // Map of WASM primitive types
    static Types: { [k: string]: PrimitiveType } = {
        I32: new PrimitiveType('i32', 1),
        I64: new PrimitiveType('i64', 2),
        F32: new PrimitiveType('f32', 1),
        F64: new PrimitiveType('f64', 2),
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
     * @param size - memory size as measured by multiples of 32 bits
     */
    private constructor(
        public name: string,
        public _size: number,
    ) {
        super(undefined);
    }

    size() {
        return this._size;
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
        // if (!type)
        //     console.log(this, new Error('wwww').stack);
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
     * @override
     */
    flatPrimitiveList(): RefType<DataType>[] {
        // TODO this is bad, should just be [I32]
        // This should just give i32. For caller to get this functionality they should have to call this.type.flatPrimitiveList()
        return [this];
    }

    unpackRefs(): RefType<DataType>[] {
        let offset = 0;
        return this.type.flatPrimitiveList().map(t => {
            const oldOffset = offset;
            if (t instanceof PrimitiveType)
                switch ((t as PrimitiveType).name) {
                    case 'i32': case 'f32': offset += 4; break;
                    case 'i64': case 'f64': offset += 8; break;
                    default: throw new Error('wtf?');
                }
            else if (t instanceof EnumBaseType)
                offset += 8;
            else {
                // Otherwise it's a reference
                offset += 4;
                // console.log('RefType.fpl(): other type: ', t);
            }
            return new RefType(this.token, t, oldOffset);
        });
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

    size() {
        return 1;
    }

    toString(): string {
        return (this.type ? this.type.toString() : '_') + " Ref";
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
        // let offset = 0;
        return [new RefType(this.token, this.type)];
        // return this.type.flatPrimitiveList().map(t => {
        //     const oldOffset = offset;
        //     if (t instanceof PrimitiveType)
        //         switch (t.name) {
        //             case 'i32': case 'f32': offset += 4; break;
        //             case 'i64': case 'f64': offset += 8; break;
        //             default: throw new Error('wtf?');
        //         }
        //     else
        //         // Otherwise it's a pointer
        //         offset += 4;

        //     return new RefType(this.token, t, oldOffset);
        // });
    }

    isUnit(): boolean {
        return false;
    }
    size() {
        return 1;
    }
    toString(): string {
        return this.type.toString() + " Ptr";
    }
}

/**
 * Matches anything within same enum type
 */
export class EnumBaseType extends DataType {
    name?: string;
    ns!: Namespace;

    /**
     * @param subtypes Enum members defined by this class
     */
    constructor(
        token: LexerToken,
        protected subtypes: { [k: string]: EnumClassType<any> },
        public recursive = false,
    ) {
        super(token);
        Object.entries(this.subtypes).forEach(([sym, t], i) => {
            t.parent = this;
            t.index = i;
            t.name = sym;
        });
    }

    /**
     * Update the subtype mappings
     */
    setSubtypes(subtypes: { [k: string]: EnumClassType<any> }) {
        this.subtypes = subtypes;
        Object.entries(subtypes).forEach(([sym, t], i) => {
            t.parent = this;
            t.index = i;
            t.name = sym;
        });
    }


    /**
     * Handle recursive types
     * When two type is recursive we only care about the non-recursive members
     * being compatible as that would make the recursive references compatible
     */
    private _recCheck: WeakSet<EnumBaseType>;

    /**
     * @override
     */
    check(type: Type): boolean {
        // Drop classes
        if (type instanceof ClassType)
            type = type.getBaseType();
        if (!type)
            return false;

        // Any type
        if (type instanceof AnyType)
            return true;

        // Yikes
        const isChild = () => Object.values(this.subtypes).some(t => t.check(type));
        const isCompat = () => {
            // Handle simple, non-recursive cases first
            if (!(type instanceof EnumBaseType && this.token === type.token))
                return false;

            // Recursive case
            if (this.recursive) {
                if (!this._recCheck)
                    this._recCheck = new WeakSet();
                if (this._recCheck.has(type))
                    return true;
                this._recCheck.add(type);
                const ret = Object.entries(this.subtypes).every(([name, st]) =>
                    st.type.check((type as EnumBaseType).subtypes[name].type));
                this._recCheck.delete(type);
                return ret;
            }

            // Non recursive
            return Object.entries(this.subtypes).every(([name, st]) =>
                st.type.check((type as EnumBaseType).subtypes[name].type));
        };
        // console.log([this.name, (type as any).name], [this === type, isChild(), isCompat()]);
        return type && (this === type || isChild() || isCompat());
    }
    isUnit(): boolean {
        // return Object.values(this.subtypes).every(t => t.isUnit());
        return false;
    }
    flatPrimitiveList(): (PrimitiveType | RefType<DataType>)[] {
        return [PrimitiveType.Types.I32, new RefType(this.token, null)];
    }
    getWasmTypeName(): string {
        // type index + ref address
        return 'i32';
    }
    getBaseType(): Type {
        return this;
    }
    toString(): string {
        return `(: ${
            this.isRecursive()
                ?  Object.keys(this.subtypes).join(' ') + ' '
                :  `\n${Object.entries(this.subtypes).map(([sym, t]) =>
                    `${t.toString()} $${sym} =`).join('\n')}\n`
        }) enum`;
    }

    sortedSubtypes() {
        return Object.values(this.subtypes).sort((a, b) => a.index - b.index);
    }

    isRecursive() {
        return this.recursive;
    }

    getId(id: string) {
        return this.ns.getId(id);
    }
}

/**
 * Matches class defined within an enum
 */
export class EnumClassType<T extends DataType> extends DataType {
    /**
     * Metadata associating this class with the parent
     */
    parent: EnumBaseType;
    index: number;

    /**
     * @param token - Code where
     * @param type - Underlying data type stored
     * @param name - Name assigned to type
     * @param recursive - Does this class need to be stored on the heap?
     */
    constructor(token: LexerToken, public type: T, public name: string, public recursive = false) {
        super(token);
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

        // if (type instanceof EnumClassType)
        //     console.log('st: ', [this.type, type.type],
        //         this.token === type.token,
        //         this.index === type.index,
        //         this.type.check(type.type));
        // else
        //     console.log(type.constructor);
        return type instanceof EnumClassType
            && this.token === type.token    // corrolaries: same parent, same class id
            && this.index === type.index
            // TODO this is wrong
            && (this.type.check(type.type));
    }
    isUnit(): boolean {
        return false;
    }
    flatPrimitiveList(): (PrimitiveType | RefType<DataType>)[] {
        // Is this right?
        return [PrimitiveType.Types.I32, new RefType(this.token, this.type)];
    }
    getWasmTypeName(): string {
        // Is this right?
        // type index + ref address
        return 'i32';
    }
    toString(): string {
        return `${this.type.toString()} ${this.name}#${this.index}_enum`;
    }
    getBaseType() {
        let ret = this.type;
        while (ret instanceof EnumClassType || ret instanceof ClassType)
            ret = ret.getBaseType();
        return ret;
    }
}