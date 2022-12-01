import type WasmNumber from './numbers.js';
import { IdToken, LexerToken } from './scan.js';
import type Context from './context.js';
import type ModuleManager from './module.js';
import type * as expr from './expr/index.js';
import type Namespace from './namespace.js';
import * as types from './datatypes.js'; // If we actually have to import datatypes here it will not work

// TODO should move these to /expr/value.ts so that cyclic imports are less anal

/**
 * In this context, Values are like nodes on an AST, but also used to simplify constexprs/partial evaluation
 */

/**
 * Enum to represent what syntactic type is currently on the stack
 */
// TODO should probably use Classes/Inheritance instead of this
export enum ValueType {
    Macro   = 0, // Macro literal with unknown signature/inlined
    Data    = 1, // Physically representable data known at compile time
    Type    = 2, // DataType/schema
    Id      = 3, // Escaped identifier
    Expr    = 4, // Data that's only known at runtime
    Fxn     = 5, // Function/Branch
    Str     = 6, // String literal, (note not directly usable)
    Ns      = 7, // Namespace
}

// TODO should be abstract
/**
 * Generic value base class
 */
export class Value {
    /// Source location in code
    token: LexerToken;

    /// Node type
    type: ValueType;

    /// Relevant Value
    value: any;

    // Enum relevant here but ts doesn't let me use it
    static Type = ValueType;

    constructor(token: LexerToken, type: ValueType, value: any, protected _datatype?: types.Type) {
        this.token = token;
        this.type = type;
        this.value = value;
    }

    /**
     * Do we know it at compile time?
     */
    isConstExpr(): boolean {
        return this.type !== ValueType.Expr;
    }

    /**
     * This is emulating the behavior of Expr.out
     * @param ctx compilation context
     * @param fun function export body
     */
    out?(ctx: ModuleManager, fun?: expr.FunExpr): string;
    // out(ctx: ModuleManager, fun?: expr.FunExpr): string {
    //     return expr.fromDataValue([this]).map(e => e.out(ctx, fun)).join(' ');
    // }

    /**
     * Name for type of this value
     */
    typename() {
        return ValueType[this.type];
    }

    get datatype(): types.Type {
        return this._datatype || types.SyntaxType.ValueTypes[this.type];
    }

    /**
     * @depricated
     */
    set datatype(t: typeof this._datatype) {
        this._datatype = t;
    }

    get expensive() {
        return false;
    }

    children(): expr.Expr[] {
        return [];
    }
}

/**
 * Data with a user-level type, this includes numbers, tuples and classes
 */
export class DataValue extends Value {
    declare _datatype: types.Type;
    type: ValueType.Data = ValueType.Data;

    constructor(token: LexerToken, type: types.Type, value: any) {
        super(token, ValueType.Data, value, type);
    }

    get datatype(): typeof this._datatype {
        return this._datatype;
    }
    set datatype(t: typeof this._datatype) {
        this._datatype = t;
    }
}

/**
 * Primitive data, native wasm types
 */
export class NumberValue extends DataValue {
    declare _datatype: types.ClassOrType<types.PrimitiveType>;

    constructor(token: LexerToken, wasmNumber: WasmNumber) {
        super(token, types.PrimitiveType.typeMap[wasmNumber.type], wasmNumber);
    }

    /**
     * See code in expr/expr.ts
     */
    out(): string {
        return this.value.toWAST();
    }

    /**
     * See code in expr/expr.ts
     */
    children(): expr.Expr[] {
        return [];
    }

    get datatype(): typeof this._datatype {
        return this._datatype;
    }
    set datatype(t: typeof this._datatype) {
        this._datatype = t;
    }
}

/**
 * Escaped Identifier
 */
export class IdValue extends Value {
    declare value: string[];
    declare token: IdToken;
    type: ValueType.Id = ValueType.Id;

    constructor(token: IdToken, public isGlobal = false) {
        super(token, ValueType.Id, token.value);
    }

    /**
     * Convert Id's to values
     */
    deref(ctx: Context) {
        return ctx.getId(this.token.value);
    }
}

/**
 * Packed values
 */
export class TupleValue extends DataValue {
    declare value: Value[];
    declare _datatype: types.ClassOrType<types.TupleType>;

    constructor(token: LexerToken, values: Value[], datatype?: types.ClassOrType<types.TupleType>) {
        const type = datatype || new types.TupleType(token, values.map(v => v.datatype || null));
        super(token, type, values);
    }

    children(): expr.Expr[] {
        // @ts-ignore
        return [].concat(...this.value.map(v => v.children && v.children()));
    }
    out(ctx: ModuleManager, fun?: expr.FunExpr) {
        return this.value.map(v => v.out(ctx, fun)).join('');
    }

    get datatype(): typeof this._datatype {
        return this._datatype;
    }
    set datatype(t: typeof this._datatype) {
        this._datatype = t;
    }
}

// Note that there is no need for a UnionValue class because there are no instances of unions
// unions will only be needed as types for opaque?-expressions

/**
 * String literal, not data
 */
export class StrValue extends Value {
    declare value: string;
    constructor(token: LexerToken, str?: string | Uint8Array) {
        if (str)
            super(token, ValueType.Str, typeof str === 'string' ? str : new TextDecoder().decode(str));
        else if (token.type === LexerToken.Type.String)
            super(token, ValueType.Str, token.token);
        else
            throw new Error('Invalid call');
    }
}

/**
 * Set of identifiers
 */
export class NamespaceValue extends Value {
    declare value: Namespace;
    type: ValueType.Ns = ValueType.Ns;

    constructor(token: LexerToken, ns: Namespace) {
        super(token, ValueType.Ns, ns);
    }
}