const binaryen = require("binaryen");
const wabtProm = require("wabt")();

const value = require('./value');
const types = require('./datatypes');
const error = require('./error');


// Should probably make a ContextProxy class to help with tracing
// Or maybe just a clone method would be ok (but less efficient)

/**
 * This class stores state assocated with the parser
 *
 * TODO remove public API's
 */
class Context {
    // Default constructor
    constructor() {
        // Set initialize props

        // Place to push/pop arugments
        this.stack = [];

        // Exports
        this.module = {};

        // Identifier map
        this.scopes = [{}];

        // Invoke stack
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

        // Warnings
        this.warnings = [];

        // Exports
        this.exports = [];
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
     * @deprecated
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

        const recursive = this.trace.includes(v.value);

        // Push value onto callstack
        this.trace.push(v.value);

        switch (v.type) {

            // Invoke
            case value.ValueType.Fxn:
                if (!recursive) {
                    // console.log(token.token, this.traceIO(v, token));
                }
            case value.ValueType.Macro:
                const ret = v.value.action(this, token);
                if (ret instanceof Array)
                    return new error.SyntaxError(ret.map(e => `${token.token}: ${e}`).join('; '), token, this);
                if (ret instanceof error.SyntaxError) {
                    ret.tokens.push(token);
                    return ret;
                }
                break;

            // Just put it on stack
            default:
                this.push(v);
        }

        this.trace.pop();
        return this;
    }

    /**
     * Determine number of inputs and outputs
     * @param {Value} v - value to invoke
     * @returns {{in: Number, out: Value[]}} - results from trace
     */
    traceIO(v, token) {
        // Copy state
        const oldStack = this.stack.slice();
        const oldMin = this.minStackSize;
        this.minStackSize = this.stack.length;

        // Invoke
        this.invoke(v, token);

        // Determine state change
        const ntakes = oldStack.length - this.minStackSize;
        const nout = this.stack.length - this.minStackSize;
        const out = this.stack.slice(-nout);
        const delta = this.stack.length - oldStack.length;

        // Restore state
        this.stack = oldStack;
        this.minStackSize = oldMin;

        return { ntakes, out, delta };
    }

    /**
     * Push value onto stack
     * @param {Value[]} v  - push something on to the stack
     */
    push(...v) {
        this.stack.push(...v);
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

    /**
     * Warn the user when something seems weird
     *
     * @param {Token} token - location in code
     * @param {string} msg - what's wrong
     * @returns {void}
     */
    warn(token, msg) {
        console.warn("WARNING: ", msg, token);
        this.warnings.push({ token, msg });
    }


    /**
     * @param {Object} options - settings
     * @returns {string} - WAST source code
     */
    async outWast({ fast = false, folding = false, optimize = false }) {
        // Create module from generated WAST
        const src = `(module \n${
            this.exports.map(e => e.out(this)).join('\n')
        })`;
        if (fast)
            return src;

        const wabt = await wabtProm;
        const mod = wabt.parseWat("test", src, {
            exceptions: true,
            mutable_globals: true,
            sat_float_to_int: true,
            sign_extension: true,
            simd: true,
            threads: true,
            multi_value: true,
            tail_call: true,
            bulk_memory: true,
            reference_types: true,
            annotations: true,
            gc: true,
        });

        // Validate
        const invalid = mod.validate();
        if (invalid) {
            console.error(invalid);
        }

        // Pass through binaryen for optimizations
        //  NOTE this doesn't work
        //  Something wrong with binaryen.js ig
        if (optimize) {
            const m2 = binaryen.readBinary(mod.toBinary({}));
            m2.optimize();
            m2.validate();
            return folding ? m2.emitText() : m2.emitStackIR();
        }

        return mod.toText({ foldExprs: folding, });

        /*
        const mod = binaryen.parseText(src);

        // Invalid?! return unchecked code for debugging compiler
        if (!mod.validate()) {
            console.error('invalid wast?!!');
            return src;
        }

        // Return wat
        return options.folding ? mod.emitText() : mod.emitStackIR();
        */
    }

    /**
     * Wasm binary buffer
     */
    async outWasm() {
        const src = await this.outWast({ fast: true });
        const wabt = await wabtProm;
        const mod = wabt.parseWat("test", src, {
            exceptions: true,
            mutable_globals: true,
            sat_float_to_int: true,
            sign_extension: true,
            simd: true,
            threads: true,
            multi_value: true,
            tail_call: true,
            bulk_memory: true,
            reference_types: true,
            annotations: true,
            gc: true,
        });

        // Validate
        const invalid = mod.validate();
        if (invalid) {
            console.error(invalid);
        }

        return mod.toBinary({log: true});
    }

    /**
     * @returns {Object} - key stack info
     */
    backupStack() {

    }

    restoreStack(backup) {

    }
};

module.exports = Context;
