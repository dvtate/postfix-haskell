const value = require('./value');
const types = require('./types');

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
        this.globals = {
            ...require('./globals'),    // Operators
            ...require('./debug_macros'), // Debug operators
        };

        // Add global primitives
        Object.entries(types.PrimitiveType.Types).forEach((typeName, type) => {
            this.globals[typeName] = new value.Value(null, value.ValueType.Type, type)
        });
    }

    /**
     * Look up identifier
     *
     * @param {LexerToken|string} id - identifier name
     * @param {Array<Object<String, Value>>} [scopes] - scopes to check in
     * @returns {[value, scope] || undefined} - returns value if found
     */
    getId(id, scopes) {
        scopes = scopes || this.scopes;
        // Check scoped variables
        id = typeof id == 'string' ? id : id.token.token;
        const unescaped = id[0] == '$' ? id.slice(1) : id;
        const nss = unescaped.split('.');

        // Resolve namespaces
        // TODO might be useful to figure out where resolution failed
        let ret;

        // Find first id in namespace
        for (let i = this.scopes.length - 1; i >= 0; i--) {
            for (const ns of nss)
                ret = this.scopes[i][ns];
        }

        // Globals
        return ret || this.globals[id];
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
        for (let i = 0; i < old.length; i++)
            if (this.stack[i] !== old[i])
                return i - 1;
    }

};

module.exports = Context;