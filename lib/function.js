const Macro = require('./macro');
const value = require('./value');
const types = require('./datatypes');
const error = require('./error');
const expr = require('./expr');
const { WasmNumber } = require('./numbers');
const { TraceResults } = require('./context');
const { stat } = require('fs');

// TODO there need to be a lot of special errors for this so that user knows what to fix

/**
 * In this language 'functions' are more like overloadable operators.
 * They work as an associative array of conditions and actions
 *
 * Being overloadable is the key distinction between these and macros
 *
 * Functions are the only way to make branching code
 */
module.exports = class Fun {
    /**
     * @param {Token} [token] - token for first def
     * @param {Value<Macro>} [condition] - condition macro for first def
     * @param {Value<Macro>} [action] - action macro for first def
     */
    constructor(token, condition, action) {
        // Macros corresponding to checks and outputs
        this.tokens = token !== undefined ? [token] : [];
        this.conditions = condition ? [condition] : [];
        this.actions = action ? [action] : [];
    }

    /**
     * Add branch to this functor
     * @param {Token} token -
     * @param {Macro} condition -
     * @param {Macro} action -
     */
    overload(token, condition, action) {
        // Prevent multiple overloads... (is this ok?)
        const idx = this.tokens.indexOf(token);
        // console.log('overload', this.tokens[0].token, this.tokens.includes(token));
        if (idx !== -1) {
            this.tokens[idx] = token;
            this.actions[idx] = action;
            this.conditions[idx] = condition;
        } else {
            this.tokens.push(token);
            this.conditions.push(condition);
            this.actions.push(action);
        }
    }

    /**
     * @param {Context} ctx - parser context
     * @param {Token} token - token of invocation
     * @returns {SyntaxError|Context} - same as return value of Macro.action()
     */
    action(ctx, token) {
        // Pick which branch to follow
        const conds = this.conditions.map(cond => {
            // Copy stack
            // Note mss only important for actions as conditions could
            const stk = ctx.stack.slice();
            const mss = ctx.minStackSize;

            // Invoke condition
            const rv = ctx.invoke(cond, token);
            // const rv = cond.value.action(ctx, token);
            if (rv instanceof Array || rv instanceof error.SyntaxError)
                return rv;

            const ret = ctx.pop();// || new value.NumberValue(token, new WasmNumber().fromString('1'));

            // Restore stack
            ctx.stack = stk;
            ctx.minStackSize = mss;
            return ret;
        });

        // Check types
        const typeErr = conds.find(rv =>
            ![value.ValueType.Data, value.ValueType.Expr].includes(rv.type)
            || !types.PrimitiveType.Types.I32.check(rv.datatype) && rv);
        if (typeErr) {
            console.log("typerror: ", typeErr);
            return ['function conditions must put an I32 on top of stack'];
        }

        // Check for errors
        // TODO should prob ignore errors if one of conditions is truthy
        //      so that user can overload operators with diff # inputs
        const errs = conds.filter(c => c instanceof Array || c instanceof error.SyntaxError);
        if (errs.length) {
            console.log('[warning] fn errs: ', errs);
            // TODO we need to make an error datatype that combines these into a single error
            ctx.warn.push(...errs);
        }

        // Create a list of pairs containing possibly truthy branch conditions
        // and their corresponding actions. Remove anything invalid/falsey
        // TODO some checks should give user errors instead of ignoring
        const branches = conds
            .map((ret, i) =>
                !(ret instanceof Array || ret instanceof error.SyntaxError)
                && (ret.type === value.ValueType.Expr
                    || (ret.type === value.ValueType.Data && ret.value.value != 0n))
                && [ret, this.actions[i]])
            .filter(i => !!i);

        // No truthy condition found
        // TODO non-const-expr
        // console.log(ctx.stack);
        if (branches.length === 0) {
            console.log(ctx.stack);
            return new error.SyntaxError("no matching function case", [token], ctx);
        }

        // Determine if entire branch is constexpr and locate else-clause
        let isConstExpr = true;
        let i = branches.length - 1;
        for (; i >= 0; i--) {
            // Constexpr-truthy branch, this makes an else clause, even if there were others after it
            if (branches[i][0].type === value.ValueType.Data && branches[i][0].value.value != 0n)
                break;

            // Non-constexpr, keep going in case we can eliminate some paths w/ const-exprs
            if (branches[i][0].type === value.ValueType.Expr)
                isConstExpr = false;
        }
        if (i == -1)
            i = 0;

        // Branch is known at compile-time: invoke corresponding action
        if (isConstExpr)
            return branches[i][1].value.action(ctx, token);

        // Runtime checks... fmllll
        // Unfortunately we have to trace in order to construct the branch expression

        // Trace ios, filter recursive branches
        const ios = branches
            .slice(i)
            .map(b => ctx.traceIO(b[1], token))
            .filter(io => io !== null);

        const err = ios.find(t => !(t instanceof TraceResults));
        if (err)
            return err;

        // Verify consistent # i/o's
        if (ios.some(t => t.delta !== ios[0].delta)) {
            console.error('Fun.action ios inconsistent:', ios);
            return ['functions must have runtime consistency for number of inputs/outputs'];
        }

        // Figure out how many args to pull
        const maxTakes = ios.map(t => t.takes).reduce((acc, v) => v.length > acc.length ? v : acc);
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
        const first = ios[0].gives;
        if (ios.some(t => t.gives.some((v, i) => v.datatype !== first[i].datatype)))
            return ['function must have consistent return types'];

        // Drop inputs from stack
        ctx.popn(maxTakes.length);

        // Push branch expr
        const branch = new expr.BranchExpr(this.tokens, branches.map(b => b[0]), ios.map(t => t.gives));
        const results = first.map((o, i) => new expr.ResultExpr(token, o.datatype, branch, i));
        ctx.push(...results);
    }
};