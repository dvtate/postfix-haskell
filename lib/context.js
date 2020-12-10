const value = require('./value');
const types = require('./datatypes');

/**
 * This class stores state assocated with the parser
 */
class Context {
    // Default constructor
    constructor() {
        // Set initialize props
        this.stack = [];
        this.module = {};
        this.scopes = [{}];
        this.trace = [];

        // Initialize globals
        this.globals = {
            ...require('./globals'),    // Operators
            ...require('./debug_macros'), // Debug operators
        };
        Object.entries(types.PrimitiveType.Types).forEach(([typeName, type]) => {
            this.globals[typeName] = new value.Value(null, value.ValueType.Type, type)
        });
        this.globals['Any'] = new value.Value(null, value.ValueType.Type, new types.Type());
    }

    /**
     * Look up identifier
     *
     * @param {LexerToken|string} id - identifier name
     * @param {Array<Object<String, Value>>} [scopes] - scopes to check in
     * @returns {[value, scope] | undefined} - returns value if found
     */
    getId(id, scopes) {
        // Use provided scope
        scopes = scopes || this.scopes;

        // Resolve Local
        for (let i = scopes.length - 1; i >= 0; i--)
            if (scopes[i][id])
                return scopes[i][id];

        // Resolve Global
        return this.globals[id];
    }

    /**
     * Serialization
     * TODO this is a stub
     *
     * @returns {Object}
     */
    toJSON() {
        return this;
    }

    /**
     * Deserialization, Stub
     * @param {*} object
     */
    fromJSON(object) {
        Object.keys(this).forEach(k => this[k] = object[k]);
    }

    /**
     * Copy state/context
     *
     * @returns {Context} - Cloned Context instance
     */
    clone() {
        const ret = new Context();
        ret.fromJSON(JSON.parse(JSON.stringify(this)));
        return ret;
    }

    /**
     * Get index for first value on stack that hasn't been seen before
     *
     * @param {Value[]} old - Previous stack slice()
     */
    cmpStack(old) {
        let i;
        for (i = 0; i < old.length; i++)
            if (this.stack[i] !== old[i])
                return i;
        return i;
    }

    /**
     * Invoke macro or function
     * @param {Value} value
     */
    invoke(v) {
        // TODO Check for recursion via this.trace

        // Push value onto callstack
        this.trace.push(v.value);

        switch (v.type) {
            case value.ValueType.Fxn:
                v = v.value.toMacro(ctx);
            case value.ValueType.Macro:
        }
    }
};

module.exports = Context;