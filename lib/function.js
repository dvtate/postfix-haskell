const Macro = require('./macro');
const value = require('./value');
const types = require('./datatypes');
const error = require('./error');

/**
 * In this language 'functions' are more like overloadable operators
 *
 * Being overloadable is the key distinction between these and macros
 *
 * Functions are the only way to make branching code
 */
module.exports = class Function {
    /**
     * @param {Token} token
     */
    constructor(token, condition = undefined, action = undefined) {
        // Token for where function first declared
        this.token = token;

        // Macros corresponding to checks and outputs
        this.conditions = condition ? [condition] : [];
        this.actions = action ? [action] : [];
    }

    /**
     * Add branch to this functor
     * @param {Macro} condition
     * @param {Macro} action
     */
    overload(condition, action) {
        this.conditions.push(condition);
        this.actions.push(action);
    }

    /**
     * @returns {Macro} - Wrapper for this function
     */
    toMacro(ctx) {
        // Only accept integers
        const intType = new types.UnionType(undefined, [
            types.PrimitiveType.Types.I32,
            types.PrimitiveType.Types.I64,
        ]);

        // Create Macro wrapper
        return new Macro((ctx, token) => {
            // Pick which branch to follow
            const conds = this.conditions.map(cond => {
                // Copy stack
                // Note that other context already protected
                const stk = ctx.stack;
                ctx.stack = ctx.stack.slice();

                // Invoke condition
                cond.action(ctx, token);
                if (cond instanceof Array || cond instanceof error.SyntaxError)
                    return cond;
                const ret = ctx.stack.pop();

                // Restore stack
                ctx.stack = stk;
                return ret;
            });

            // Check for errors
            const errs = conds.filter(c => c instanceof Array || c instanceof error.SyntaxError);
            if (errs.length) {
                console.log('fn errs: ', errs);
                // TODO we need to make an error datatype that combines these into a single error
                return errs[0];
            }

            // Find first truthy condition
            // Note it's best not to use !== here because bigints
            const idx = conds.reverse().findIndex(ret =>
                ret.type === value.ValueType.Data
                && intType.check(ret.datatype)
                && ret.value.value != 0n);

            // No truthy condition found
            // TODO non-const-expr
            if (idx === -1) {
                return new error.SyntaxError("no matching function case", [token], ctx);
            }

            // Invoke corresponding action
            return this.actions.reverse()[idx].action(ctx, token);
        }, ctx);
    }
};