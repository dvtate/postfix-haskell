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
     * @param {[Number, Number]} [io] - number of inputs and outputs
     */
    constructor(token, condition, action, io = null) {
        // Macros corresponding to checks and outputs
        this.tokens = token ? [token] : [];
        this.conditions = condition ? [condition] : [];
        this.actions = action ? [action] : [];
        this.io = io;
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
     * @returns {Macro} - Wrapper for this function
     */
    toMacro(ctx) {
        // TODO should just make invoke method instead of this

        // Only accept integers
        const intType = new types.UnionType(undefined, [
            types.PrimitiveType.Types.I32,
            types.PrimitiveType.Types.I64,
        ]);

        // Create Macro wrapper
        return new value.Value(undefined, value.ValueType.Macro, new Macro((ctx, token) => {
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

            // Check for errors
            const errs = conds.filter(c => c instanceof Array || c instanceof error.SyntaxError);
            if (errs.length) {
                console.log('fn errs: ', errs);
                // TODO we need to make an error datatype that combines these into a single error
                return errs[0];
            }

            // Find first truthy condition
            // Note it's best not to use !== in last condition because bigints
            // TODO non-const-expr
            const idx = conds.reverse()
                .findIndex(ret =>
                    ret.type === value.ValueType.Data
                    && intType.check(ret.datatype)
                    && ret.value.value != 0n); // NOTE bigints
            // No truthy condition found
            // TODO non-const-expr
            if (idx === -1)
                return new error.SyntaxError("no matching function case", [token], ctx);

            // Invoke corresponding action
            return this.actions[this.actions.length - 1 - idx].value.action(ctx, token);
        }, ctx));
    }
};