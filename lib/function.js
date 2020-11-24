const { arch } = require('os');
const Macro = require('./macro');


/**
 * In this language 'functions' are more like overloadable operators
 *
 * Being overloadable is the key distinction between these and macros
 * Functions are the only way to make branching code
 */
module.exports = class Functor {
    constructor(token) {
        // Token for where function first declared
        this.token = token;

        // Macros corresponding to checks and outputs
        this.conditions = [];
        this.actions = [];
    }

    /**
     * @returns {Macro} - Wrapper for this functor
     */
    toMacro(ctx) {
        return new Macro((ctx, token) => {
            // TODO
            // For each condition
                // Copy context
                // Execute condition
                // If condition result is true
                    // Invoke corresponding action
                    // This action is complete
                // Restore context
            // If No condition was met
                // throw an error as function cannot be invoked
        }, ctx);
    }
};