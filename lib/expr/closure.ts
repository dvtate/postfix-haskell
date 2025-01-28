import { uid } from '../util.js';

import * as value from '../value.js';
import * as types from '../datatypes.js';
import * as error from '../error.js';
import { LexerToken } from '../scan.js';
import type ModuleManager from '../module.js';

import { DataExpr, Expr } from './expr.js';
import { InternalFunExpr, FunExpr, ParamExpr } from './func.js';
import { LiteralMacro, Macro } from '../macro.js';
import { DependentLocalExpr, TeeExpr } from './util.js';
import Context from '../context.js';

/**
 * Capture lexically scoped variables and store them into a new closure object
 * Leaves address of the closure object on the stack
 *
 */
export class ClosureCreateExpr extends DataExpr {
    /**
     * Lexically scoped variables to be captured
     */
    captured: DataExpr[] = [];

    func: InternalFunExpr;

    // The body of the function
    params: DataExpr[];

    tableIndex: number;

    constructor(token: LexerToken, public macro: LiteralMacro, ctx?: Context) {
        if (!(macro.datatype instanceof types.ArrowType))
            throw new error.SyntaxError('invalid runtime closure', [token, macro.token], ctx);
        if (macro.inputTypes.some(t => !(t instanceof types.DataType)))
            throw new error.SyntaxError(
                'invalid runtime closure with compile-time-only inputs',
                [token, macro.token],
                ctx,
            );
        super(token, macro.datatype);

        if (ctx)
            this.fromMacro(ctx);
    }


    fromMacro(ctx: Context) {
        // Make function
        this.func = new InternalFunExpr(
            this.token,
            `closure_${uid()}`,
            this.macro.inputTypes as types.DataType[],
        );
        const paramsExprs = this.macro.inputTypes.map((t, i) =>
            new ParamExpr(this.token, t as types.DataType, this.func, null));

        // Trace, with relevant context modifications
        const copyStack     = ctx.stack;
        const copyScopes    = ctx.scopes;
        // const copyCurrFun   = ctx.currentFunction;
        // const copyProxyLocs = ctx.proxyLocals;
        ctx.stack           = paramsExprs;
        ctx.scopes          = this.macro.scopes;
        // ctx.currentFunction = this.func;
        // ctx.proxyLocals     = [];
        const ios = ctx.traceIO(this.macro, this.token);
        if (ios instanceof error.CompilerError)
            throw ios;
        ctx.stack           = copyStack;
        ctx.scopes          = copyScopes;
        // ctx.currentFunction = copyCurrFun;
        // const proxiedLocals = ctx.proxyLocals;
        // ctx.proxyLocals     = copyProxyLocs;
        this._datatype = ios.toArrowType(this.token);

        // Get things to capture
        // proxiedLocals.filter(l => l.)
        const leaves = [].concat(...ios.gives.map(e => e instanceof Expr ? e.getLeaves() : []));
        const specialLeaves = leaves.find(l => [ParamExpr, DependentLocalExpr, TeeExpr, ].includes(l.constructor));

        // Closure object is always the first argument
        const closureObjectType = new types.TupleType(this.token, [
            types.PrimitiveType.Types.I32,          // Table index for function body
            ...this.captured.map(e => e.datatype),  // Captured values
        ]);
        const closureObjectLocal = this.func.addLocal(
            new types.RefType(this.token, closureObjectType)
        );

        // User inputs
        // Note that the they might not actually touch all inputs in which case we ignore unused
        this.params = paramsExprs.slice(-ios.takes.length);
        this.params.forEach(p => (p as ParamExpr).inds = this.func.addLocal(p.datatype));
        this.func.nparams = 1 + this.params.length;
    }

    out(ctx: ModuleManager, fun: FunExpr) {
        // Add function to module table once only
        if (!this._isCompiled) {
            ctx.addFunction(this.func);
            this.tableIndex = ctx.addToTable(this.func.name);
        }

        // Capture lexically scoped vars and convert them to args/lm addr?
            // this is super painful ... maybe check to see if they've been compiled yet?
            // maybe extend expressions?

        return '';
    }

    outInline(ctx: ModuleManager, fun: FunExpr) {
        // We may not actually need to make this a proper closure
        // for example if used within tail-recursive body it doesn't need to capture locals
        return '';
    }

    children(): Expr[] {
        throw new Error('todo');
    }

}

export class ClosureInvokeExpr extends Expr {
    inputs: DataExpr[];

    // Usable output exprs
    outputs: DependentLocalExpr[];

    nTakes: number;

    constructor(token: LexerToken, public closure: ClosureCreateExpr) {
        super(token);
        if (!(this.closure.datatype instanceof types.ArrowType))
            throw new Error('wtf');
        this.outputs = this.closure.datatype.outputTypes.map(t =>
            new DependentLocalExpr(token, t as types.DataType, this));
        throw new Error('gggg');
    }

    out(ctx: ModuleManager, fun: FunExpr) {
        // DependentLocalExpr checks this
        this._isCompiled = true;

        // Load function index from closure object pointer on the stack
        // And invoke function via function table
        // The first argument being the closure object
        this.outputs.forEach(r => r.setInds(fun));
        let ret = this.closure.out(ctx, fun);
        ret += '(i32.load (global.get $__ref_sp)) (call_indirect)';
        ret += this.outputs.map(r => fun.setLocalWat(r.getInds()));
        return ret;
    }

    invoke(ctx: Context) {
        this.inputs = ctx.popn(this.nTakes).reverse() as DataExpr[];
        ctx.push(...this.outputs);
    }

    children(): Expr[] {
        throw new Error('todo');
    }
}