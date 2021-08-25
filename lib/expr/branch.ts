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
    NumberExpr
} from './expr';


/**
 * Flatten a list of mixed values+expressions into a single list of expressions
 * @param vs array of values
 * @returns array of expressions
 */
 function fromDataValue(vs: Array<DataExpr | value.Value>) {
    return vs.map(v => {
        if (v instanceof DataExpr)
            return v;

        if (v instanceof value.NumberValue)
            return new NumberExpr(v.token, v);
        if (v instanceof value.TupleValue)
            return fromDataValue(v.value);

        // Eww runtime error...
        throw new error.TypeError("incompatible type", v.token, v, null);
    }).reduce((a, v) =>
        v instanceof Array ? a.concat(v) : (a.push(v), a),
        [],
    );
}

/**
 * Describes branching action
 *
 * this should only get used when it cannot be determined which branch to take at compile time
 */
 export class BranchExpr extends Expr {
    // Locations in source
    tokens: LexerToken[];

    // Condtions for brances
    conditions: Array<DataExpr>;

    // Actions for branches
    actions: Array<DataExpr>[];

    // Where results are delivered
    results: DependentLocalExpr[];

    /**
     * @param token - location in code
     * @param conditions - conditions for branches
     * @param actions - actions for brances
     */
    constructor(
        tokens: LexerToken[],
        conditions: Array<DataExpr|value.DataValue>,
        actions: Array<DataExpr|value.DataValue>[]
    ) {
        super(tokens[0]);
        this.tokens = tokens;
        this.conditions = fromDataValue(conditions);
        this.actions = actions.map(fromDataValue);
        this.results = [];
    }

    /**
     * @override
     */
    out(ctx: ModuleManager, fun: FunExportExpr) {
        // Prevent multiple compilations
        this._isCompiled = true;

        const conds = this.conditions.map(c => c.out(ctx, fun)).reverse();
        const acts = this.actions.map(a => a.map(v => v.out(ctx, fun)).join(' ')).reverse();
        const retType = this.actions[0].map(e => e.datatype.getWasmTypeName()).join(' ');
        const results = this.results.filter(r => !r.datatype.getBaseType().isVoid());

        // Add result datatypes
        results.forEach(r => {
            if (r.datatype instanceof types.PrimitiveType)
                r.index = fun.addLocal(r.datatype);
            // TODO handle others
        });

        // Last condition must be else clause
        if (conds[conds.length - 1] != '(i32.const 1)') {
            // console.log(conds[conds.length - 1]);
            throw new error.SyntaxError("no else case for fun branch", this.tokens);
        }

        // // n+1 blocks
        // let ret = "";
        // ret += `(block $branch (result ${retType}) `;
        // for (let i = 0; i < conds.length; i++)
        //     ret += '(block ';

        // // add conds
        // conds.forEach((c, i) => {
        //    ret += ` ${c}`;
        //    ret += ` (br_if ${i})`;
        // });

        // acts.forEach((a, i) => {
        //     ret += ')';
        //     ret += ` ${a}`;
        //     if (conds.length - i - 1 > 0)
        //         ret += `(br $branch)`;
        // });

        // ret += ')';
        // return ret;

        // Compile to (if (...) (result ...) (then ...) (else ...))
        let ret: string = (function compileIf(i) {
            return i + 1 >= acts.length
                ? acts[i]
                : `(if (result ${retType})${conds[i]
                    }\n\t(then ${acts[i]})\n\t(else ${compileIf(i + 1)}))`;
        })(0);

        ret += '\n\t' + results.map(r => `(local.set ${r.index})`).join();

        // console.log('BranchExpr', ret);
        return ret;
    }

    /**
     * @override
     */
    children(): Expr[] {
        return this.conditions.concat(this.actions.reduce((a, v)=>a.concat(v)));
    }
};
