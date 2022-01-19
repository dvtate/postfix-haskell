import * as value from '../value';
import * as types from '../datatypes';
import * as error from '../error';
import { LexerToken } from '../scan';
import ModuleManager from '../module';

import {
    DataExpr,
    Expr,
    FunExportExpr,
    DependentLocalExpr,
} from './expr';
import { LiteralMacro, Macro } from '../macro';

/**
 * Capture lexically scoped variables around a macro
 */
export class ClosureExpr extends DataExpr {
    constructor(public macro: LiteralMacro) {
        super(macro.token, macro.datatype);
    }

    out(ctx: ModuleManager, fun: FunExportExpr) {
        // Create new function for it's body
        // Add function to module table
        // Capture lexically scoped vars and convert them to args/lm addr?
            // this is super painful ... maybe check to see if they've been compiled yet?
            // maybe extend expressions?

        return '';
    }
}