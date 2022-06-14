import * as value from './value';
import * as types from './datatypes';
import * as error from './error';
import * as expr from './expr';
import Context, { TraceResults } from './context';
import { LexerToken } from './scan';
import { fromDataValue } from './expr';
import { Macro } from './macro';
import WasmNumber from './numbers';

// TODO there need to be a lot of special errors/warnings for this so that user knows what to fix

/**
 * In this language 'functions' are more like overloadable operators or branches.
 * They work as an associative array of conditions and actions
 *
 * Being overloadable is the key distinction between these and macros
 *
 * Functions are the only way to make branching code
 */
export default class Fun {
    /**
     * Where in the codebase each component is located
     */
    tokens: LexerToken[] = [];

    /**
     * Preconditions for each branch
     */
    conditions: Macro[] = []

    /**
     * Actions/postconditions for each branch
     */
    actions: Macro[] = [];

    /**
     * Identifier function is bound to
     * @note only used in debugging
     */
    name: string;

    /**
     * Is the function marked as recursive?
     */
    recursive = false;

    /**
     * @param [token] - token for first def
     * @param [condition] - condition macro for first def
     * @param [action] - action macro for first def
     * @param [name] - debugging symbol
     */
    constructor(
        token?: LexerToken,
        condition?: Macro,
        action?: Macro,
        name?: string,
    ) {
        this.tokens = token ? [token] : [];
        this.conditions = condition ? [condition] : [];
        this.actions = action ? [action] : [];
        this.name = name;
    }

    /**
     * Add branch to this functor
     * @param token - overload site (`fun`)
     * @param condition - pre-invoke test
     * @param action - action when test passses
     */
    overload(token: LexerToken, condition: Macro, action: Macro) {
        // Prevent multiple overloads
        const idx = this.tokens.indexOf(token);
        // console.log('overload', this.tokens[0].token, this.tokens.includes(token));
        if (idx !== -1) {
            // this.tokens[idx] = token;
            this.actions[idx] = action;
            this.conditions[idx] = condition;
        } else {
            this.tokens.push(token);
            this.conditions.push(condition);
            this.actions.push(action);
        }
    }

    // TODO refactor
    /**
     * @param ctx context object
     * @param token invokee token
     * @returns same as return value of Macro.action
     */
    action(ctx : Context, token: LexerToken): error.SyntaxError | Context | Array<string> | null {
        // To prevent duplicate expressions we can copy input exprs to locals
        // FIXME: once we know inputs and shit we then need to store them into the Branch expr so that
        //  the value they're capturing is captured before branch body and only accessed via relevant local
        const oldStack = ctx.stack.slice();
        ctx.stack = ctx.stack.map(v =>
            v instanceof expr.DataExpr
                // @ts-ignore typescript doesn't understand `.constructor`
                && v.expensive
                    ? new expr.BranchInputExpr(v.token, v)
                    : v);

        // Pick which branch to follow
        // TODO stop at first else statement
        const conds = this.conditions.map(cond => {
            // Typecheck vs pattern matching
            if (cond.datatype && !cond.checkInputs(ctx.stack))
                return new value.NumberValue(null, new WasmNumber(WasmNumber.Type.I32, 0));

            // Copy stack
            // Note mss only important for actions as conditions could
            const stk = ctx.stack.slice();
            const mss = ctx.minStackSize;

            // Invoke condition
            const rv = ctx.invoke(cond, cond.token || token);
            // const rv = cond.value.action(ctx, token);
            if (rv instanceof error.SyntaxError)
                return rv;
            const ret = ctx.pop();// || new value.NumberValue(token, new WasmNumber().fromString('1'));

            // Restore stack
            ctx.stack = stk;
            ctx.minStackSize = mss;
            return ret;
        });

        // Check types
        const typeErr = conds.find(rv =>
            (rv instanceof value.DataValue || rv instanceof expr.DataExpr)
            && (![value.ValueType.Data, value.ValueType.Expr].includes(rv.type)
                || !types.PrimitiveType.Types.I32.check(rv.datatype) && rv));
        if (typeErr) {
            console.error("typerror: ", typeErr);
            return ['function conditions must put an I32 on top of stack'];
        }

        // Check for errors
        // TODO should prob ignore errors if one of conditions is truthy
        //      so that user can overload operators with diff # inputs
        const errs: error.SyntaxError[] = conds.filter(e => e instanceof error.SyntaxError) as error.SyntaxError[];

        if (errs.length) {
            // console.warn(`[warning] ${this.name}: fn errs: `, ...errs.map(e => {
            //     const ret: any = { msg: e.message || e };
            //     if (e.tokens)
            //         ret.tokens = e.tokens.map((t: LexerToken) => ({t: t.token, f: t.file, p: t.position }));
            //     return ret;
            // }));
            // TODO we need to make an error datatype that combines these into a single error
            errs.forEach(e => ctx.warn(e.tokens[0], `[warn] ${this.name}: fn err: ${e.message || e}`));
            // console.warn(`[warn] ${this.name}: fn errs: ${errs.map(e => e.message || e).join('\n')} `);
            // return errs.reverse()[0];
        }

        // Create a list of pairs containing possibly truthy branch conditions
        // and their corresponding actions. Remove anything invalid/falsey
        // TODO some checks should give user errors instead of ignoring
        const branches = (conds
            .map((ret, i) =>
                !(ret instanceof Array || ret instanceof error.SyntaxError)
                && (ret instanceof expr.Expr
                    || (ret instanceof value.DataValue && ret.value.value != BigInt(0)))
                && [ret, this.actions[i]])
            .filter(b => !!b)) as Array<[value.DataValue | expr.DataExpr, Macro]>;

        // No truthy condition found
        // TODO non-const-expr
        if (branches.length === 0) {
            console.error("stack", ctx.stack);
            return new error.SyntaxError(`${this.name}: no matching function case`, [token], ctx);
        }

        // Determine if entire branch is constexpr and locate first else-clause
        let isConstExpr = true;
        let i = branches.length - 1;
        for (; i >= 0; i--) {
            // Constexpr-truthy branch, this makes an else clause, even if there were others after it
            if (branches[i][0] instanceof value.DataValue && branches[i][0].value.value != BigInt(0))
                break;

            // Non-constexpr, keep going in case we can eliminate some paths w/ const-exprs
            if (branches[i][0] instanceof expr.Expr)
                isConstExpr = false;
        }
        if (i === -1)
            i = 0;

        // Branch is known at compile-time: invoke corresponding action
        if (isConstExpr) {
            ctx.stack = oldStack;
            return ctx.toError(branches[i][1].action(ctx, token), token);
        }

        // Runtime checks... fmllll
        // Unfortunately we have to trace in order to construct the branch expression

        // Trace ios, filter recursive branches
        const traceResults = branches
            .slice(i)
            .map(b => ctx.traceIO(b[1], b[1].token || token))
            .filter(io => io !== null);

        // Look for an error
        const err = traceResults.find(t => !(t instanceof TraceResults)) as error.SyntaxError;
        if (err)
            return err;

        const ios = traceResults as TraceResults[];

        // Verify consistent # i/o's
        if (ios.some(t => t.delta !== ios[0].delta)) {
            console.error('Fun.action ios inconsistent:', ios);
            return ['functions must have runtime consistency for number of inputs/outputs'];
        }

        // Figure out how many args to pull
        const maxTakes = ios.map(t => t.takes).reduce((acc, v) => v.length > acc.length ? v : acc, []);
        const maxGives = Math.max(...ios.map(t => t.gives.length));

        // Allgin all branch ios
        ios.forEach(t => {
            if (t.gives.length < maxGives) {
                // Pull from stack
                t.gives = ctx.stack
                    .slice(ctx.stack.length - maxTakes.length, ctx.stack.length - t.takes.length)
                    .concat(t.gives);
                t.takes = maxTakes;
            }
        });

        // Verify all have same return types
        const first = ios[0].gives as expr.DataExpr[];
        if (ios.some(t => t.gives.some((v, i) =>
            (v instanceof value.DataValue || v instanceof expr.DataExpr)
            && !v.datatype.getBaseType().check(first[i].datatype)))
        ) {
            console.error("ios", ios);
            return ['function must have consistent return types'];
        }

        // Drop inputs from stack
        const inputs = ctx.popn(maxTakes.length).reverse();

        // No pointless tee expressions
        ctx.stack = oldStack.slice(0, ctx.stack.length);

        // Make branch expr
        const branch = new expr.BranchExpr(
            this.tokens,
            fromDataValue(branches.map(b => b[0]), ctx),
            ios.map(t => fromDataValue(t.gives, ctx)),
            inputs.filter(e => e instanceof expr.BranchInputExpr) as expr.BranchInputExpr[],
            this.name,
        );
        const results = first.map(o => new expr.DependentLocalExpr(token, o.datatype, branch));
        branch.results = results;
        branch.args = inputs;
        ctx.push(...results);

        /*
        // Push branch expr
        // TODO remove `as` here
        const branch = new expr.BranchExpr(this.tokens, branches.map(b => b[0]), ios.map(t => fromDataValue(t.gives)));
        const results: DependentLocalExpr[] = [];
        const ret: value.Value[] = [];
        first.forEach(o => {
            if (o instanceof value.TupleValue) {
                const dles = o.value.map((v: value.Value) =>
                    new DependentLocalExpr(token, v.datatype, branch));
                results.push(...dles);
                ret.push(new value.TupleValue(token, dles, o.datatype));
            } else {
                const v = new expr.DependentLocalExpr(token, o.datatype, branch);
                results.push(v);
                ret.push(v);
            }
        });
        branch.results = results;
        branch.args = inputs;
        ctx.push(...ret);
        */
    }
}