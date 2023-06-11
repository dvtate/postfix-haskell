import * as value from '../value.js';
import * as types from '../datatypes.js';
import { LexerToken } from '../scan.js';
import ModuleManager from '../module.js';
import { Expr, DataExpr } from './expr.js';
import { TeeExpr, DependentLocalExpr, } from './util.js';
import { FunExpr, ParamExpr } from './fun.js';
import { BranchExpr } from './branch.js';

/**
 * Used to wrap arguments passed to recursive functions as they are being traced in a way that
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
    constructor(token: LexerToken, datatype: types.DataType, negIndex: number, value: value.Value) {
        super(token, datatype);
        this.negIndex = negIndex;
        this.value = value;
    }

    out(ctx: ModuleManager, fun: FunExpr) {
        return this.value.out(ctx, fun);
    }

    children(): Expr[] {
        return [];
    }
}

/**
 * The body of the recursive function
 * (replaces call that initiates the recursion)
 */
export class RecursiveBodyExpr extends Expr {
    /**
     * Input expressions
     */
    takes: Array<DataExpr> = null;

    /**
     * Input Locals
     */
    takeExprs: DependentLocalExpr[] = null;

    /**
     * Output expressions
     */
    gives: Array<DataExpr> = null;

    /**
     * Output locals
     */
    giveExprs: DependentLocalExpr[] = null;

    /**
     * Unique labels
     */
    id: number;
    label: string;

    /**
     * Used to make unique label
     */
    static _uid = 0;

    /**
     * Can we TCO?
     */
    isTailRecursive = false;

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

    out(ctx: ModuleManager, fun: FunExpr) {
        // Prevent multiple compilations
        this._isCompiled = true;

        // If not tail recursive, generate a helper function instead of a loop
        this.isTailRecursive = this._isTailRecursive();
        if (!this.isTailRecursive)
            return this.outFn(ctx, fun);

        // Select non void types
        // const voidTakes: Array<DependentLocalExpr | false>
        //     = this.takeExprs.map(e => !e.datatype.getBaseType().isUnit() && e);
        // const voidGives: Array<DependentLocalExpr | false>
        //     = this.giveExprs.map(e => !e.datatype.getBaseType().isUnit() && e);

        // Store inputs in locals
        this.takeExprs.forEach(e => e.setInds(fun));
        let ret = `\n\t${this.takeExprs.map((e, i) =>
            `${this.takes[i].out(ctx, fun)}${fun.setLocalWat(e.getInds())}`
        ).join('\n\t')}\n\t`;

        // Create place to store outputs
        this.giveExprs.forEach(e => e.setInds(fun));

        // Body
        const retType = this.gives.map(e => e.datatype.getWasmTypeName()).join(' ');
        ret += `(loop ${this.label} (result ${retType})\n\t${
            this.gives.map(e => e.out(ctx, fun)).join('\n\t')
        })\n\t${
            this.giveExprs.map(e => fun.setLocalWat(e.getInds())).join(' ')
        }\n\t`;

        // console.log('RecursiveBodyExpr', ret);
        return ret;
    }

    /**
     * Version of this.out() for when it's not tail-recursive
     */
    outFn(ctx: ModuleManager, fun: FunExpr) {
        // Since we're moving body to another function we have to move locals
        const captureExprs = this.gives
            .map(e => e.getLeaves())
            .reduce((a, v) => a.concat(v), [])
            .filter(e => {
                // Should not already be bound, right?
                const eInds = e instanceof DependentLocalExpr && e.getInds();
                if ( (eInds && eInds.length)
                    || (e instanceof TeeExpr && e.inds)) {
                // console.error(e, e instanceof DependentLocalExpr && e.getInds());
                // throw new Error("wtf?");
                    return true;
                }

                // Parameters need to be passed as arguments to helper
                if (e instanceof ParamExpr)
                    return true;

                return false;
            })
            // .filter(e => e.expensive)
            .reverse() as ParamExpr[];

        // Make recursive helper function
        this.helper = new RecFunExpr(
            this.token,
            this.label,
            this.takeExprs,
            captureExprs,
            ctx,
        );
        this.helper.outputs = this.gives;
        ctx.addFunction(this.helper);

        // Create place to store outputs
        this.giveExprs.forEach(e => e.setInds(fun));

        // Invoke helper function and capture return values into dependent locals
        return `${
            this.takes.map(e => e.out(ctx, fun)).join('')
        }${
            captureExprs.map((e: DataExpr) => e.out(ctx, fun)).join('')
        }\n\t(call ${this.label})${
            this.giveExprs.map(e => fun.setLocalWat(e.getInds())).join('')
        }`;
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
    _isTailRecursive(): boolean {
        const isTailRecursive = (e: Expr): boolean => {
            if (e instanceof RecursiveResultExpr && e.source.body === this)
                return true;
            if (e instanceof RecursiveBodyExpr)
                return true;
            if (e instanceof BranchExpr)
                return e.actions
                    .map(vs => vs.slice(-gives.length))
                    .every(es => es.every(e => isTailRecursive(e) || isNonRecursive(e)));
            return false;
        };
        const isNonRecursive = (e: Expr): boolean => {
            if (e instanceof DependentLocalExpr) {
                if (e.source instanceof RecursiveBodyExpr)
                    return e.source === this && !this.giveExprs.find(e1 => e1 === e);
                if (e.source instanceof BranchExpr)
                    return e.source.actions
                        .map(vs => vs.slice(-gives.length))
                        .every(es => es.every(e => isNonRecursive(e)));
            }

            // TODO glhf implementing this one lmao ;-;
            return !!process.env.PHC_FORCE_TCO;
        };

        // Covers infinite loop case
        if (this.gives.some(c => c instanceof RecursiveResultExpr))
            return true;
        const nSliceIndex = this.gives.findIndex((e, i) => e !== this.takes[i]);
        if (this.gives.slice(nSliceIndex).some(e => !(e instanceof DependentLocalExpr)))
            return false;
        const gives = this.gives.slice(nSliceIndex) as DependentLocalExpr[];
        if (!gives.length)
            return true; // is this right?
        const firstSrc = gives[0].source;
        if (gives.some(e => e.source !== firstSrc))
            return false;
        return  isTailRecursive(firstSrc);

        // TODO also detect enum match exprs

        // If body not a branch result DependentLocalExpr, return false
        // Go through branch conditions, if any of them calls self say no
        // Go through branch actions, if any of them isn't tr, say no
        // istr:
        //  - if it returns RecursiveResultExpr then it's TR
        //  - if it doesn't call self it is tr
        //  - otherwise it's not tr

        return false;
    }
}

/**
 * Function that gets added to module but isn't exported
 */
// TODO need to figure out how to share rv locals between functions
// Should reference function host function
export class RecFunExpr extends FunExpr {
    public takeExprs: DependentLocalExpr[];
    public copiedParams: ParamExpr[];

    constructor(
        token: LexerToken,
        name: string,
        takeExprs: DependentLocalExpr[],
        copiedParams: ParamExpr[],
        module: ModuleManager,
    ) {
        super(
            token,
            name,
            [].concat(...takeExprs.map(e => e.datatype))
                .concat(...copiedParams.map(p => p.datatype)),
            module,
        );
        this.takeExprs = takeExprs;
        this.copiedParams = copiedParams.filter(e => !e.datatype.isUnit());
    }

    out(ctx: ModuleManager): string {
        // Capture original positions so that we can revert later so that old references don't break
        const originalIndicies = this.copiedParams.map(e => e.inds);

        // Alias our DependentLocalExpr inputs to params
        let paramIdx = 0;
        this.takeExprs.forEach(e => {
            e.inds = this.params[paramIdx++].inds;
        });

        // Temporarily update indicies to refer to our params
        this.copiedParams.forEach(e => {
            e.inds = this.params[paramIdx++].inds;
        });

        // Compile body & generate type signatures
        // TODO tuples
        const outs = this.outputs.map(o => o.out(ctx, this)); // Body of fxn
        const paramTypes = this.locals.slice(0, this.nparams).map(t => t.datatype.getWasmTypeName()).join(' ');
        const resultTypes = this.outputs.map(r => r.datatype.getWasmTypeName()).filter(Boolean).join(' ');

        // Generate output wat
        const ret = `(func ${this.name} ${
            // Parameter types
            paramTypes ? `(param ${paramTypes})` : ''
        } ${
            // Return types
            resultTypes ? `(result ${resultTypes})` : ''
        } ${
            // Write body
            this.wrapBody(`${
                // Passed references are on the ref stack, store them in rv stack
                this.setLocalWat(
                    [...this.takeExprs, ...this.copiedParams]
                        .map(e => e.inds || []).reduce((a, b) => a.concat(b), [])
                        .filter(l => l.datatype instanceof types.RefType))
            } ${outs.join('\n\n')}`)
        })`;

        // Revert modifications to the exprs so that other places they're referenced don't break
        this.copiedParams.forEach((e, i) => e.inds = originalIndicies[i]);
        return ret;
    }

    /**
     * @overrride
     */
    children(): Expr[] {
        return []
            .concat(...this.takeExprs.map(e => e.children()))
            .concat(...this.copiedParams.map(e => e.children()));
    }
}

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
        this.giveExprs = body.giveExprs.map((e: DataExpr, i: number) =>
            new RecursiveResultExpr(token, e.datatype, this, i));
    }

    out(ctx: ModuleManager, fun: FunExpr) {
        // Prevent recompiling
        this._isCompiled = true;

        // TCO behavior
        if (this.body.isTailRecursive) {
            // console.log('call', this.giveExprs);
            // Set arg locals
            let ret = `\n\t${this.takeExprs.map((e, i) =>
                `${e.out(ctx, fun)}${
                    !this.body.takeExprs[i] || !this.body.takeExprs[i].getInds()
                        ? ''
                        : fun.setLocalWat(this.body.takeExprs[i].getInds())}`
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
            this.takeExprs.map(e => e.out(ctx, fun)).join(' ')
        } ${
            this.body.helper.copiedParams.map((p: DataExpr) => p.out(ctx, fun)).join('')
        } (call ${this.body.label})`;
    }

    /**
     * @override
     */
    get expensive(): boolean {
        return true;
    }

    children(): Expr[] {
        return this.body.children().concat(this.takeExprs).concat(this.giveExprs);
    }
}

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
    constructor(token: LexerToken, datatype: types.DataType, source: RecursiveCallExpr, position: number) {
        super(token, datatype);
        this.source = source;
        this.position = position;
    }

    out(ctx: ModuleManager, fun: FunExpr) {
        let ret = '';
        if (!this.source._isCompiled)
            ret += this.source.out(ctx, fun);

        // When tail-recursive we don't care about intermediate results
        if (this.source.body.isTailRecursive)
            return ret;

        return ret;
    }

    children() {
        return [this.source];
        throw new Error('bad wtf');
    }
}