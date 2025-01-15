import * as value from '../value.js';
import * as error from '../error.js';
import { LexerToken } from '../scan.js';
import ModuleManager from '../module.js';
import { DataExpr, Expr } from './expr.js';
import type { FunExpr, FunLocalTracker } from './fun.js';
import { DependentLocalExpr } from './util.js';

/**
 * Describes expensive expressions which were on the stack before a branch was invoked
 *
 * These expressions are stored into local variables to reduce duplication within branch
 */
export class BranchInputExpr extends DataExpr {
    /**
     * Id for local variable into which it should be stored
     */
    index: FunLocalTracker[] = null;

    /**
     * Expression that this should capture
     */
    declare value: DataExpr;

    constructor(token: LexerToken, value: DataExpr) {
        super(token, value.datatype);
        this.value = value;
    }

    /**
     * Store into locals
     * @param ctx
     * @param fun
     * @returns WAT
     */
    capture(ctx: ModuleManager, fun: FunExpr) {
        // if (this.index)
        //     return '';
        this.index = fun.addLocal(this.value.datatype);
        return `${this.value.out(ctx, fun)}\n${fun.setLocalWat(this.index)}`;
    }

    /**
     * @override
     */
    out(ctx: ModuleManager, fun: FunExpr) {
        if (!this._datatype.isUnit() && !this.index) {
            console.log('branch input: ', this.value);
            console.log(new Error('bt'));
        }
        return fun.getLocalWat(this.index);
    }

    /**
     * @override
     */
    get expensive(): boolean {
        return this.index !== null;
    }

    /**
     * @override
     */
    children(): Expr[] {
        return [this.value];
    }
}

/**
 * Describes branching action
 *
 * this should only get used when it cannot be determined which branch to take at compile time
 */
// TODO augment for enums
export class BranchExpr extends Expr {
    /**
     * Locations in source
     */
    tokens: LexerToken[];

    /**
     * Condtions for brances
     */
    conditions: Array<DataExpr>;

    /**
     * Actions for branches
     */
    actions: Array<DataExpr>[];

    /**
     * Where results are delivered
     */
    results: DependentLocalExpr[];

    /**
     * Stack arguments
     */
    inputExprs: BranchInputExpr[];

    args?: Array<value.Value>;

    /**
     * @param token - location in code
     * @param conditions - conditions for branches
     * @param actions - actions for brances
     */
    constructor(
        tokens: LexerToken[],
        conditions: Array<DataExpr>,
        actions: Array<DataExpr>[],
        inputExprs: BranchInputExpr[],
        public name?:string,
    ) {
        super(tokens[0]);
        this.tokens = tokens;
        this.conditions = conditions;
        this.actions = actions;
        this.inputExprs = inputExprs;
        this.results = [];
    }

    /**
     * @override
     */
    out(ctx: ModuleManager, fun: FunExpr) {
        // Prevent multiple compilations
        this._isCompiled = true;
        const inputs = this.inputExprs.map(e => e.capture(ctx, fun)).join('\n\t');

        // Compile body
        // Notice order of compilation from top to bottom so that locals are assigned before use
        // TODO FIXME still not perfect... may need to convert tee-exprs
        const conds = new Array(this.conditions.length);
        const acts = new Array(this.actions.length);
        for (let i = this.conditions.length - 1; i >= 0; i--) {
            const invIdx = (this.conditions.length - i) - 1;
            conds[invIdx] = this.conditions[i].out(ctx, fun);
            acts[invIdx] = this.actions[i].reverse().map(a => a.out(ctx, fun)).join(' ');
        }
        // const conds = this.conditions.map(c => c.out(ctx, fun)).reverse();
        // const acts = this.actions.map(a => a.map(v => v.out(ctx, fun)).join(' ')).reverse();

        // Generate result type signature
        const retType = this.actions[0].map(e => e.datatype.getWasmTypeName()).join(' ');

        // Set up dependent locals
        this.results.forEach(r => r.setInds(fun));

        // Last condition must be else clause
        if (conds[conds.length - 1] != '(i32.const 1)') {
            // console.log(conds[conds.length - 1]);
            throw new error.SyntaxError("no else case for fun branch", this.tokens);
        }

        /*
        // n+1 blocks
        let ret = "";
        ret += `(block $branch (result ${retType}) `;
        for (let i = 0; i < conds.length; i++)
            ret += '(block ';

        // add conds
        conds.forEach((c, i) => {
           ret += ` ${c}`;
           ret += ` (br_if ${i})`;
        });

        acts.forEach((a, i) => {
            ret += ')';
            ret += ` ${a}`;
            if (conds.length - i - 1 > 0)
                ret += `(br $branch)`;
        });

        ret += ')';
        return ret;
        */

        // Compile to (if (...) (result ...) (then ...) (else ...))
        // Note that there's some BS done here to work around multi-return if statements not being allowed :(
        const retSet = this.results.map(r => fun.setLocalWat(r.getInds())).join('');
        let ret: string = inputs + (function compileIf(i): string {
            return i + 1 >= acts.length
                ? acts[i] + retSet
                : `${conds[i]}\n\t(if ${
                    retType.length === 1 ? `(result ${retType})` : ''
                }\n\t(then ${
                    acts[i] + retSet
                })\n\t(else ${
                    compileIf(i + 1)
                }))`;
        })(0);
        if (retType.length === 1)
            ret += '\n\t' + retSet;

        // console.log('BranchExpr', ret);
        return ret;
    }

    /**
     * @override
     */
    children(): Expr[] {
        return this.conditions.concat(this.actions.reduce((a, v)=>a.concat(v)));
    }
}