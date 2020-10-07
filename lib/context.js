/**
 *
 */
class Context {
    // Default constructor
    constructor() {
        this.stack = [];
        this.module = {};
        this.scopes = [{}];
        this.globals = { ...require('./globals'), };
    }

    /**
     * Look up identifier
     *
     * @param {LexerToken|string} id - identifier
     * @returns {[value, scope]} - returns value if found
     */
    getId(id) {
        // Check scoped variables
        id = typeof id == 'string' ? id : id.token.token;
        const unescaped = id[0] == '$' ? id.slice(1) : id;
        const scopes = unescaped.split('.');

        // Resolve namespaces
        // TODO might be useful to figure out where resolution failed
        let ret;

        // Find first id in namespace
        for (let i = this.scopes.length - 1; i >= 0; i--) {
            for (const ns of scopes)
                ret = this.scopes[i][ns];

        }

        // Globals
        return ret || this.globals[id];
    }

};

module.exports = Context;