import * as value from '../value.js';
import * as types from '../datatypes.js';
import { LexerToken } from '../scan.js';
import ModuleManager from '../module.js';
import { Expr, DataExpr, FunExpr, ParamExpr } from './expr.js';
import { TeeExpr, DependentLocalExpr, } from './util.js';

export class UnknownEnumExpr extends DataExpr {

    out(ctx: ModuleManager, fun?: FunExpr): string {
        return 'todo';
    }

    children(): Expr[] {
        return null;
    }

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
}
