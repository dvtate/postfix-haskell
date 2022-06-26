import * as types from '../datatypes.js';
import type * as value from '../value.js';
import type { LexerToken } from '../scan.js';
import type ModuleManager from '../module.js';
import { Expr, DataExpr } from './expr.js';
import type { FunExpr } from './fun.js';

export class EnumContainsCheckExpr extends DataExpr {
    _datatype: types.ClassOrType<types.PrimitiveType> = types.PrimitiveType.Types.I32;

    get datatype(): typeof this._datatype  { return this._datatype; }
    set datatype(t: typeof this._datatype) { this._datatype = t; }
    children(): Expr[] { return null; }

    out() {
        return 'i32.const 0';
    }
}

export class EnumGetExpr extends DataExpr {
    declare _datatype: types.RefType<any>;

    enumExpr: UnknownEnumExpr | EnumConstructor;


    out() {
        return 'todo';
    }

    children(): Expr[] { return null; }
}

export class UnknownEnumExpr extends DataExpr {

    constructor(token: LexerToken, public source: DataExpr, dt: types.EnumBaseType) {
        super(token, dt);
    }

    out(ctx: ModuleManager, fun?: FunExpr): string {
        return 'todo';
    }

    children(): Expr[] {
        return null;
    }

    // containsType(t: number | types.EnumClassType<types.DataType>): EnumContainsCheckExpr {

    // }

    // getType(t: number | types.EnumClassType<types.DataType>): EnumGetExpr {}

}

/**
 * Used to construct a gc'd object and reference it via enum
 */
export class EnumConstructor extends DataExpr {
    knownValue: DataExpr;

    constructor(token: LexerToken, v: value.Value, datatype: types.EnumClassType<types.DataType>) {
        super(token, datatype);
    }

    out(ctx: ModuleManager, fun?: FunExpr): string {
        return 'todo';
    }

    children(): Expr[] {
        return null;
    }

    // containsType(t: number | types.EnumClassType<types.DataType>): value.NumberValue {

    // }
}

// Construct gc'd value
export function constructGc(e: DataExpr, ctx: ModuleManager, fun?: FunExpr): string {
    let ret = e.out(ctx, fun);
    const locals = fun.addLocal(e.datatype);
    ret += fun.setLocalWat(locals);

    return 'todo';
}
