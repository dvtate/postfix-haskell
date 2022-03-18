import * as value from '../value';
import * as types from '../datatypes';
import * as error from '../error';
import { LexerToken } from '../scan';
import ModuleManager from '../module';

import {
    DataExpr,
    Expr,
    FunExportExpr,
} from './expr';
import { LiteralMacro, Macro } from '../macro';

/**
 * Capture lexically scoped variables and store them into a new closure object
 * Leaves address of the closure object on the stack
 */
export class ClosureCreateExpr extends DataExpr {
    /**
     * Lexically scoped variables to be captured
     */
    public captured: DataExpr[];


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

export class ClosureInvokeExpr extends DataExpr {

    out(ctx: ModuleManager, fun: FunExportExpr) {
        // Load function index from closure object pointer
        // Put closure object pointer back onto stack
        // Invoke function in via function table
        return '';
    }
}