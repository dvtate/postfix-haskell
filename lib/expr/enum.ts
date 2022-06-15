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
}

export class KnownEnumExpr extends DataExpr {

    out(ctx: ModuleManager, fun?: FunExpr): string {
        return 'todo';
    }
}

