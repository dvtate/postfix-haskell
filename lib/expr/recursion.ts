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


/**
 * Used to wrap arguments passed to recursive functions as they are being tracd in a way that
 * they can later be used to determine the bindings for parameters in
 * recursive calls within the body
 */
 export class RecursiveTakesExpr extends DataExpr {
    negIndex: number;

    /**
     * @param token location in source code
     * @param datatype type of argument
     * @param negIndex stack index of argument
     * @param value value being passed as argument
     */
    constructor(token: LexerToken, datatype: types.Type, negIndex: number, value) {
        super(token, datatype);
        this.negIndex = negIndex;
        this.value = value;
    }

    out(ctx: ModuleManager, fun: FunExportExpr) {
        return this.value.out(ctx, fun);
    }
};

/**
 * The body of the inlined, TCO'd recursive function
 * (replaces call that initiates the recursion)
 */
export class RecursiveBodyExpr extends Expr {
    // Input expressions
    takes: Array<DataExpr> = null;

    // Input Locals
    takeExprs: DependentLocalExpr[] = null;

    // Output expressions
    gives: Array<DataExpr> = null;

    // Output locals
    giveExprs: DependentLocalExpr[] = null;

    // Unique labels
    id: number;
    label: string;

    // Used to make unique label
    static _uid = 0;

    constructor(token: LexerToken) {
        super(token);

        // Unique labels
        this.id = RecursiveBodyExpr._uid++;
        this.label = `$rec_${this.id}`;
    }

    out(ctx: ModuleManager, fun: FunExportExpr) {
        // Prevent multiple compilations
        this._isCompiled = true;

        // console.log('takes', this.takeExprs);
        console.log('gives', this.gives.map(e => e.children()).reduce((a,b)=>a.concat(b)));

        // Filter out void types
        this.takeExprs = this.takeExprs.map(e => !e.datatype.getBaseType().isVoid() && e);
        this.giveExprs = this.giveExprs.map(e => !e.datatype.getBaseType().isVoid() && e);

        // Store inputs in locals
        this.takeExprs.forEach(e => {
            if (e)
                e.index = fun.addLocal(e.datatype);
        });
        let ret = `\n\t${this.takeExprs.map((e, i) =>
            `${this.takes[i].out(ctx, fun)}${e ? `\n\t(local.set ${e.index})` : ''}`
        ).join('\n\t')}\n\t`;

        // Create place to store outputs
        this.giveExprs.forEach(e => {
            if (e)
                e.index = fun.addLocal(e.datatype);
        });

        // Body
        const retType = this.gives.map(e => e.datatype.getWasmTypeName()).join(' ');
        ret += `(loop ${this.label} (result ${retType})\n\t`;
        ret += this.gives.map(e => e.out(ctx, fun)).join('\n\t');
        ret += `)\n\t${this.giveExprs.map(e => e ? `(local.set ${e.index})` : '').join(' ')}\n\t`;

        // console.log('RecursiveBodyExpr', ret);
        return ret;
    }

    children() {
        return this.takes
            .concat(this.takeExprs)
            .concat(this.gives)
            .concat(this.giveExprs);
    }
};

/**
 * Recursive calls within function body
 */
export class RecursiveCallExpr extends Expr {
    takeExprs: DependentLocalExpr[];
    body: RecursiveBodyExpr;
    giveExprs: UnusedResultExpr[];

    constructor(token, body, takeExprs) {
        super(token);
        this.takeExprs = takeExprs;
        this.body = body;

        // Here we can use ResultExpr's because using it violates tail-recursion
        //  thus we don't have to worry about them getting out of order
        this.giveExprs = body.giveExprs.map((e, i) =>
            new UnusedResultExpr(token, e.datatype, this, i));
    }

    out(ctx: ModuleManager, fun: FunExportExpr) {
        // console.log('call', this.giveExprs);
        // Set arg locals
        let ret = `\n\t${this.takeExprs.map((e, i) =>
            `${e.out(ctx, fun)}${
                (!this.body.takeExprs[i] || e.datatype.getBaseType().isVoid())
                    ? '' : `\n\t(local.set ${this.body.takeExprs[i].index})`}`
        ).join('\n\t')}\n\t`;

        // Invoke function
        ret += `(br ${this.body.label})`;
        // console.log('RecursiveCallExpr', ret);
        return ret;
    }

    // Shouldn't matter because result shouldn't get used
    static expensive = true;

    children() {
        return this.body.children().concat(this.takeExprs).concat(this.giveExprs);
    }
};


/**
 * Unused Result of an expression that can have multiple return values
 *
 * If the result is used we should use
 *
 * @deprecated
 */
 export class UnusedResultExpr extends DataExpr {
    // Orign expression
    source: Expr;

    // Stack index
    position: number;

    /**
     * @param token - Locaation in code
     * @param datatype - Datatype for expr
     * @param source - Origin expression
     * @param position - Stack index (0 == left)
     */
    constructor(token: LexerToken, datatype: types.Type, source: Expr, position: number) {
        super(token, datatype);
        this.source = source;
        this.position = position;
    }

    out(ctx: ModuleManager, fun: FunExportExpr) {
        return !this.source._isCompiled ? this.source.out(ctx, fun) : "";
    }

    children() {
        return [this.source];
    }
};
