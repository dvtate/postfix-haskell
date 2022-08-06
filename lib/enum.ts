import * as value from './value.js';
import * as types from './datatypes.js';
import { LexerToken } from './scan.js';
import Namespace from './namespace.js';
import type Context from './context.js';
import * as error from './error.js';
import * as expr from './expr/index.js';
import ModuleManager from './module.js';

/**
 * User accessible Enum base type value
 *
 * operates as both a type and a namespace
 */
// TODO should be able to just use value.ValueType.Type
export class EnumNs extends value.Value {
    declare value: types.EnumBaseType;
    type: value.ValueType.Type = value.ValueType.Type;

    /**
     * @param token location in code
     * @param ns namespace where subtypes are stored
     * @param v enum datatype
     */
    constructor(token: LexerToken, v: types.EnumBaseType) {
        super(token, value.ValueType.Type, v);
    }

    /**
     * Create an enum from a namespace
     * @param ns namespace passed to `enum` operator
     * @param token location in code
     * @param ctx parser context
     * @returns enum namespace or error
     */
    static fromNamespace(ns: Namespace, token: LexerToken, ctx: Context, bt?: types.EnumBaseType) {
        const memberTypes: { [k: string]: types.EnumClassType<types.DataType> } = {};
        for (const [id, v] of ns.fields())
            // TODO support class macro types
            if (v.value instanceof types.ClassType) {
                // Make member type constructor
                memberTypes[id] = new types.EnumClassType(v.token, v.value.type, id, v.value.recursive);
                ns.setId(id, new value.Value(v.token, value.ValueType.Type, memberTypes[id]));
            } else {
                // We force user to pass classes so that they remember to use `make`
                // ctx.warn(v.token, 'All members of en enum type namespace should be classes');
                // return new error.SyntaxError(
                //     'All members of the enum type namespace should be classes',
                //     [v.token, token],
                //     ctx,
                // );
            }

        // Update base type
        if (bt) {
            bt.setSubtypes(memberTypes);
            bt.ns = ns;
        }

        return new EnumNs(token, bt || new types.EnumBaseType(token, memberTypes));
    }
}

/**
 * When enum value is known at compile time thus we can freely use and convert it
 */
// TODO this should extend DataValue... no reason to have separate ValueType
export class EnumValue extends value.DataValue {
    declare value: value.Value;
    declare type: value.ValueType.Data;
    declare _datatype: types.ClassOrType<types.EnumClassType<types.DataType>>;
    enumClass: types.EnumClassType<types.DataType>;

    /**
     * @param token location in code
     * @param v value stored in the enum
     * @param t subtype of the enum
     */
    constructor(token: LexerToken, v: value.Value, t: types.EnumClassType<types.DataType>) {
        super(token, t, v);
        if (!t.type.check(v.datatype))
            throw new error.SyntaxError('Enum instance incompatible types', [v.token, t.token, token]);
        this.enumClass = t;
    }

    // Fix set and get methods
    get datatype(): typeof this._datatype {
        return this._datatype;
    }
    set datatype(t: typeof this._datatype) {
        this._datatype = t;
    }

    toExpr() {
        return new expr.EnumConstructor(this.token, this.value, this.enumClass);
    }

    out(ctx: ModuleManager, fun: expr.FunExpr) {
        return this.toExpr().out(ctx, fun);
    }
}
