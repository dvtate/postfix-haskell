import * as value from '../value';
import * as types from '../datatypes';
import * as error from '../error';
import { LexerToken } from '../scan';
import ModuleManager from '../module';

import {
    Expr,
    DataExpr,
    FunExportExpr,
    DependentLocalExpr,
    ParamExpr,
    TeeExpr,
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
    constructor(token: LexerToken, datatype: types.Type, negIndex: number, value: value.Value) {
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

    isTailRecursive: boolean = false;

    /**
     * Recursive helper function
     */
    helper?: RecFunExpr;

    constructor(token: LexerToken) {
        super(token);

        // Unique labels
        this.id = RecursiveBodyExpr._uid++;
        this.label = `$rec_${this.id}`;
    }

    out(ctx: ModuleManager, fun: FunExportExpr) {
        // Prevent multiple compilations
        this._isCompiled = true;

        // If not tail recursive, generate a helper function instead of a loop
        this.isTailRecursive = this._isTailRecursive();
        if (!this.isTailRecursive)
            return this.outFn(ctx, fun);

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

    /**
     * Version of this.out() for when it's not tail-recursive
     */
    outFn(ctx: ModuleManager, fun: FunExportExpr) {
        // Filter out void types
        this.takeExprs = this.takeExprs.map(e => !e.datatype.getBaseType().isVoid() && e);
        this.giveExprs = this.giveExprs.map(e => !e.datatype.getBaseType().isVoid() && e);

        // Since we're moving body to another function we have to move locals
        const captureExprs = this.gives
            .map(e => e.getLeaves())
            .reduce((a, v) => a.concat(v), [])
            .filter(e => {
                // Parameters need to be passed as arguments to helper
                if (e instanceof ParamExpr)
                    return true;

                // Should not already be bound, right?
                if ((e instanceof DependentLocalExpr && e.index !== -1)
                    || (e instanceof TeeExpr && e.local !== null))
                {
                    console.error(e);
                    throw new Error("wtf?");
                }

                return false;
            })
            .reverse() as ParamExpr[];

        // Make recursive helper function
        this.helper = new RecFunExpr(
            this.token,
            this.label,
            this.takeExprs,
            captureExprs
        );
        this.helper.outputs = this.gives;
        ctx.addFunction(this.helper);

        // Create place to store outputs
        this.giveExprs.forEach(e => {
            if (e)
                e.index = fun.addLocal(e.datatype);
        });

        // Invoke helper function and capture return values into dependent locals
        let ret = `${
            this.takes.map(e => e.out(ctx, fun)).join('')
        }${
            captureExprs.map(e => e.out(ctx, fun)).join('')
        }\n\t(call ${this.label})${
            this.giveExprs.map(e => `(local.set ${e.index})`).join('')
        }`;

        return ret;
    }

    children() {
        return this.takes
            .concat(this.takeExprs)
            .concat(this.gives)
            .concat(this.giveExprs);
    }

    /**
     * Determine if we can apply tco
     * @returns true if we can use a loop instead of recursive func call
     */
    private _isTailRecursive(): boolean {
        // Covers infinite loop case
        if (this.gives.some(c => c instanceof RecursiveResultExpr))
            return true;

        function isSameBodyCall(e: Expr): boolean {
            return false
        }

        // If body not a branch result DependentLocalExpr, return false
        // Go through branch conditions, if any of them calls self say no
        // Go through branch actions, if any of them isn't tr, say no
        // istr:
        //  - if it returns RecursiveResultExpr then it's TR
        //  - if it doesn't call self it is tr
        //  - otherwise it's not tr

        // TODO actually detect tail-recursion lol
        return false;
    }
};

// TODO swap this with FunExportExpr
/**
 * Function that gets added to module but isn't exported
 */
export class RecFunExpr extends FunExportExpr {
    constructor(
        token: LexerToken,
        name: string,
        public takeExprs: DependentLocalExpr[],
        public copiedParams: ParamExpr[],
    ) {
        super(
            token,
            name,
            takeExprs.map(e => e.datatype).concat(copiedParams.map(p => p.datatype))
        );
    }

    out(ctx: ModuleManager) {
        // Capture original positions so that we can revert later so that old references don't break
        const originalIndicies = this.copiedParams.map(e => e.position);

        // Alias our DependentLocalExpr inputs to params
        this.takeExprs.forEach((e, i) => {
            e.index =  i;
        });

        // Temporarily update indicies to refer to our params
        this.copiedParams.forEach((e, i) => {
            e.position = this.takeExprs.length + i;
        });

        // Compile body & generate type signatures
        // TODO tuples
        const outs = this.outputs.map(o => o.out(ctx, this));
        const paramTypes = this.inputTypes.map(t => t.getWasmTypeName()).filter(Boolean).join(' ');
        const resultTypes = this.outputs.map(r => r.datatype.getWasmTypeName()).filter(Boolean).join(' ');

        // Generate output wat
        const ret = `(func ${this.name} ${
            // Parameter types
            paramTypes ? `(param ${paramTypes})` : ''
        } ${
            // Return types
            resultTypes ? `(result ${resultTypes})` : ''
        }\n\t\t${
            // Local variables
            this._locals.filter(Boolean).map(l => `(local ${l.getWasmTypeName()})`).join(' ')
        }\n\t${
            // Write body
            outs.join('\n\t')
        })`;

        // Revert modifications to the exprs so that other places they're referenced don't break
        this.copiedParams.forEach((e, i) => {
            e.position = originalIndicies[i];
        });
        return ret;
    }
};

/**
 * Recursive calls within function body
 */
export class RecursiveCallExpr extends Expr {
    takeExprs: DataExpr[];
    body: RecursiveBodyExpr;
    giveExprs: RecursiveResultExpr[];

    constructor(token: LexerToken, body: RecursiveBodyExpr, takeExprs: DataExpr[]) {
        super(token);
        this.takeExprs = takeExprs;
        this.body = body;

        // Here we can use ResultExpr's because using it violates tail-recursion
        //  thus we don't have to worry about them getting out of order
        this.giveExprs = body.giveExprs.map((e: Expr, i: number) =>
            new RecursiveResultExpr(token, e.datatype, this, i));
    }

    out(ctx: ModuleManager, fun: FunExportExpr) {
        // TCO behavior
        if (this.body.isTailRecursive) {
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

        if (fun !== this.body.helper)
            throw new Error('wtf?');

        // Call helper function
        // Note this will always be in the body of the helper function and thus a recursive call
        return `\n\t${
            this.takeExprs.map((e, i) => e.out(ctx, fun)).join(' ')
        } ${
            this.body.helper.copiedParams.map(p => p.out(ctx, fun)).join('')
        } (call ${this.body.label})`;
    }

    // Shouldn't matter because result shouldn't get used
    static expensive = true;

    children(): Expr[] {
        return this.body.children().concat(this.takeExprs).concat(this.giveExprs);
    }
};

/**
 * Unused Result of an expression that can have multiple return values
 */
export class RecursiveResultExpr extends DataExpr {
    // Origin expression
    source: RecursiveCallExpr;

    // Stack index
    position: number;

    /**
     * @param token - Locaation in code
     * @param datatype - Datatype for expr
     * @param source - Origin expression
     * @param position - Stack index (0 == left)
     */
    constructor(token: LexerToken, datatype: types.Type, source: RecursiveCallExpr, position: number) {
        super(token, datatype);
        this.source = source;
        this.position = position;
    }

    out(ctx: ModuleManager, fun: FunExportExpr) {
        let ret: string = '';
        if (!this.source._isCompiled)
            ret += this.source.out(ctx, fun);

        // When tail-recursive we don't care about intermediate results
        if (this.source.body.isTailRecursive)
            return ret;

        return ret;
    }

    children() {
        return [this.source];
    }
};
