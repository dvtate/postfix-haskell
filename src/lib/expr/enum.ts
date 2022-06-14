import * as value from '../value';
import * as types from '../datatypes';
import { LexerToken } from '../scan';
import ModuleManager from '../module';
import { Expr, DataExpr, FunExpr, ParamExpr } from './expr';
import { TeeExpr, DependentLocalExpr, } from './util';

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

