const Macro = require('./macro');
const value = require('./value');
const types = require('./datatypes');
const error = require('./error');

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
        this.tokens = token ? [token] : [];
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
        this.tokens.push(token);
        this.conditions.push(condition);
        this.actions.push(action);
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
            // Note that other context already protected
            const stk = ctx.stack;
            ctx.stack = ctx.stack.slice();

            // Invoke condition
            const rv = cond.value.action(ctx, token);
            if (rv instanceof Array || rv instanceof error.SyntaxError)
                return rv;
            const ret = ctx.stack.pop();

            // Restore stack
            ctx.stack = stk;
            return ret;
        });

        // Check types
        const typeErr = conds.find(rv =>
            ![value.ValueType.Data, value.ValueType.Expr].includes(rv.type)
            || !types.PrimitiveType.Types.I32.check(rv.datatype) && rv);
        if (typeErr) {
            console.log(typeErr);
            return ['function conditions must put an I32 on top of stack'];
        }

        //

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
        // TODO some checks should give user errors insteaad of ignoring
        const branches = conds
            .map((ret, i) =>
                !(ret instanceof Array || ret instanceof error.SyntaxError)
                && (ret.type === value.ValueType.Expr
                    || (ret.type === value.ValueType.Data && ret.value.value != 0n))
                && [ret, this.actions[i]])
            .filter(i => !!i);


        // No truthy condition found
        // TODO non-const-expr
        if (branches.length === 0)
            return new error.SyntaxError("no matching function case", [token], ctx);

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

        // Branch is known at compile-time: invoke corresponding action
        if (isConstExpr)
            return branches[i][1].value.action(ctx, token);

        // Runtime checks... fmllll
        // Unfortunately we have to trace in order to construct the branch expression

        // Invoke corresponding action
        return this.actions[this.actions.length - 1 - idx].value.action(ctx, token);
    }
};