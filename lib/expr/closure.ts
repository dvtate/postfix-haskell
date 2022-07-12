import * as value from '../value.js';
import * as types from '../datatypes.js';
import * as error from '../error.js';
import { LexerToken } from '../scan.js';
import type ModuleManager from '../module.js';

import { DataExpr, Expr } from './expr.js';
import type { FunExpr } from './fun.js';
import { LiteralMacro, Macro } from '../macro.js';

/**
 * Capture lexically scoped variables and store them into a new closure object
 * Leaves address of the closure object on the stack
 */
export class ClosureCreateExpr extends DataExpr {
    /**
     * Lexically scoped variables to be captured
     */
    public captured: DataExpr[];


    constructor(token: LexerToken, public macro: LiteralMacro) {
        if (!(macro.datatype instanceof types.ArrowType))
            throw new error.SyntaxError('invalid runtime closure', [token, macro.token]);
        super(token, macro.datatype);
    }

    out(ctx: ModuleManager, fun: FunExpr) {
        // Create new function for it's body
        // Add function to module table
        // Capture lexically scoped vars and convert them to args/lm addr?
            // this is super painful ... maybe check to see if they've been compiled yet?
            // maybe extend expressions?

        return '';
    }


    children(): Expr[] {
        throw new Error('todo');
    }
}

export class ClosureInvokeExpr extends DataExpr {

    out(ctx: ModuleManager, fun: FunExpr) {
        // Load function index from closure object pointer
        // Put closure object pointer back onto stack
        // Invoke function in via function table
        return '';
    }

    children(): Expr[] {
        throw new Error('todo');
    }
}