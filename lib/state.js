/**
 *
 */
class State {
    // Default constructor
    constructor() {
        this.stack = [];
        this.module = {};
        this.scopes = [{}];
        this.globals = { ...require('./ppcs'), };
    }

    /**
     * Look up identifier
     *
     * @param {LexerToken|string} id -
     * @param {ParserState} state -
     * @returns {undefined|Value} - returns value if found
     */
    getId(id) {
        // Check scoped variables
        id = typeof id == 'string' ? id : id.token.token;
        const unescaped = id[0] == '$' ? id.slice(1) : id;
        const scopes = unescaped.split('.');

        // Resolve namespaces
        // TODO might be useful to figure out where resolution failed
        let ret;
        for (let i = state.scopes.length; i >= 0; i--) {
            for (const ns of scopes)
                ret = state.scopes[i][ns];
            if (ret)
                break;
        }

        // Globals
        return ret || state.globals[id];
    }

};

module.exports = State;