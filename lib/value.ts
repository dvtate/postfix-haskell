import * as types from './datatypes';
import WasmNumber from './numbers';
import { LexerToken } from './scan';
import Context from './context';
import Macro from './macro';

/*
 * In this context, Values are like nodes on an AST
 */


/**
 * Enum to represent what syntactic type is currently on the stack
 */
// TODO should probably use Classes/Inheritance instead of this
export enum ValueType {
    Macro  = 0, // Macro Literal
    Data   = 1, // Physically representable data known at compile time
    Type   = 2, // DataType/schema
    Id     = 3, // Escaped identifier
    Expr   = 4, // Data that's only known at runtime
    Fxn    = 5, // Function/Branch
    Str    = 6, // String literal, (note not directly usable)
};

/**
 * Generic value base class
 */
export class Value {
    token: LexerToken;
    type: ValueType;
    value: any;
    datatype?: types.Type;

    constructor(token: LexerToken, type: ValueType, value, datatype?: types.Type) {
        this.token = token;
        this.type = type;
        this.value = value;
        this.datatype = datatype;
    }

    /**
     * Do we know it at compile time?
     */
    isConstExpr(): boolean {
        return this.type !== ValueType.Expr;
    }
};

/**
 * Data with a user-level type, this includes unions, structs and aliases
 */
export class DataValue extends Value {
    datatype: types.Type;
    constructor(token, type: types.Type, value) {
        super(token, ValueType.Data, value, type);
    }
};

export class MacroValue extends DataValue {
    value: Macro;
    constructor(token, value: Macro, type: types.Type = new types.Type()) {
        super(token, type, value);
        this.type = ValueType.Macro;
    }
};

/**
 * Primitive data, native wasm types
 */
export class NumberValue extends DataValue {
    constructor(token: LexerToken, wasmNumber: WasmNumber) {
        super(token, NumberValue._typeMap[wasmNumber.type], wasmNumber);
    }

    // Map of number types to coresponding primitive datatypes
    static _typeMap = Object.keys(WasmNumber.Type)
        .filter(k => isNaN(parseFloat(k))) // Only the labels because ts does both
        .reduce((acc, v) => ({
            ...acc,
            [WasmNumber.Type[v]] : types.PrimitiveType.Types[v],
        }), {});

    /**
     * See code in expr.ts
     */
    out(): string {
        return this.value.toWAST();
    }
};

/**
 * Escaped Identifier
 */
export class IdValue extends Value {
    scopes: Array<{ [id: string]: Value }>;
    value: string;
    constructor(token: LexerToken, id: string, scopes) {
        super(token, ValueType.Id, id);
        this.scopes = scopes;
    }

    /**
     * Convert Id's to values
     */
    deref(ctx: Context) {
        return ctx.getId(this.value, this.scopes || ctx.scopes);
    }
};

// Packed values
export class TupleValue extends DataValue {
    value: Value[];
    constructor(token: LexerToken, values: Value[] = []) {
        const type = new types.TupleType(token, values.map(v => v.datatype || null));
        super(token, type, values);
    }
};

// Note that there is no need for a UnionValue class because there are no instances of unions
// unions will only be needed as types for opaque?-expressions


// String literal, not data
export class StrValue extends Value {
    value: string;
    constructor(token: LexerToken) {
        super(token, ValueType.Str, token.token);
    }
};