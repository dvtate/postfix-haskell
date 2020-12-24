const value = require('./value');
const types = require('./datatypes');
const error = require('./error');

// Should probably make a ContextProxy class to help with tracing
// Or maybe just a clone method would be ok (but less efficient)

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
        Object.entries(types.PrimitiveType.Types).forEach(([typeName, type]) =>
            this.globals[typeName] = new value.Value(null, value.ValueType.Type, type)
        );
        this.globals['Any'] = new value.Value(null, value.ValueType.Type, new types.Type());

        // Stack tracing cunters
        this.initialStackSize = 0;
        this.minStackSize = 0;
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
     * @returns {Context|error.SyntaxError} - success or failure
     */
    invoke(v, token) {
        // TODO Check for recursion via this.trace

        // Push value onto callstack
        this.trace.push(v.value);

        switch (v.type) {
            // Convert function to macro
            // TODO add invoke method to Fun ...
            case value.ValueType.Fxn:
                v = v.value.toMacro(this);

            // Invoke macro
            case value.ValueType.Macro:
                // Invoke macro
                const ret = v.value.action(this, token);
                if (ret instanceof Array)
                    return new error.SyntaxError(ret.map(e => `${t.token}: ${e}`).join('; '), token, this);
                if (ret instanceof error.SyntaxError) {
                    ret.tokens.push(token);
                    return ret;
                }
                break;

            // Just put it on stack
            default:
                this.stack.push(v);
        }
        return this;
    }

    /**
     * Push value onto stack
     * @param {Value} v  - push something on to the stack
     */
    push(v) {
        this.stack.push(v);
    }

    /**
     * Pull value from stack
     * @returns {Value|undefined} - last value from stack
     */
    pop() {
        // Pop value
        const v = this.stack.pop() || undefined;

        // Update trackers
        if (this.stack.length < this.minStackSize)
            this.minStackSize = this.stack.length;
        return v;
    }

    /**
     * Pull multiple values from stack
     * @retuns {Value[]} - list of values from stack
     */
    popn(n) {
        // Pull values
        const ret = [];
        for (let i = 0; i < n; i++)
            ret.push(this.stack.pop());

        // Update trackers
        if (this.stack.length < this.minStackSize)
            this.minStackSize = this.stack.length;
        return ret;
    }
};

module.exports = Context;