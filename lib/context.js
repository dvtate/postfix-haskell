const binaryen = require("binaryen");
const wabtProm = require("wabt")();

const value = require('./value');
const types = require('./datatypes');
const error = require('./error');
const expr = require('./expr');
const { type } = require("os");


// Should probably make a ContextProxy class to help with tracing
// Or maybe just a clone method would be ok (but less efficient)

// Return Types for Context.traceIO() method
class TraceResults {
    /**
     *
     * @param {Value[]} takes
     * @param {Value[]} gives
     * @param {number} delta
     */
    constructor(takes, gives, delta, recursive = null) {
        this.takes = takes;
        this.gives = gives;
        this.delta = delta;
    }
};

/**
 * This class stores state assocated with the parser
 *
 * TODO remove public API's
 */
class Context {
    // Default constructor
    constructor() {
        // Place to push/pop arugments
        this.stack = [];

        // Exports
        this.module = {};

        // Identifier map
        this.scopes = [{}];

        // Invoke stack
        this.trace = [];

        this.traceResults = [
            /*
            {
                value: Value,
                result: null |
            }
            */
        ]

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

    copyState() {
        // Copy data
        const ret = {
            stack: this.stack,
            module: this.module,
            scopes: this.scopes,
            globals: this.globals,
            initialStackSize: this.initialStackSize,
            minStackSize: this.minStackSize,
            warnings: this.warnings,
            exports: this.exports,

            // Prob not needed...
            trace: this.trace,
            traceResults: this.traceResults,
        };

        // Make copies of all the state data
        this.restoreState({
            stack: [...this.stack],
            module: {...this.module},
            scopes: [...this.scopes.map(s => ({...s}))],
            globals: {...this.globals},
            initialStackSize: this.initialStackSize,
            minStackSize: this.minStackSize,
            warnings: [...this.warnings],
            exports: [...this.exports],

            // Prob not needed...
            trace: [...this.trace],
            traceResults: [...this.traceResults],
        });

        return ret;
    }


    restoreState(obj) {
        this.stack = obj.stack;
        this.module = obj.module;
        this.scopes = obj.scopes;
        this.globals = obj.globals;
        this.initialStackSize = obj.initialStackSize;
        this.minStackSize = obj.minStackSize;
        this.warnings = obj.warnings;
        this.exports = obj.exports;
        this.trace = obj.trace;
        this.traceResults = obj.traceResults;
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
     * Determine number of inputs and outputs
     * @param {value.Value} v - value to invoke
     * @param {Object} knownResults - trace results to use for recursion
     * @returns {null|TraceResults|error.SyntaxError} - results from trace
     *   + null: item is already being traced
     *   + error.SyntaxError: encountered error
     *   + Object{in,out,delta}
     */
    traceIO(v, token, knownResults = { result: null, body: null }) {
        // console.log(v);
        // console.log('trace', v);
        // Copy state
        const initialState = this.copyState();
        this.minStackSize = this.stack.length;

        // initiate trace
        this.traceResults.push({
            value: v, ...knownResults,
            token, // prolly not needed
        });

        // Invoke
        let rv;
        try {
            rv = this.invoke(v, token, true);
        } catch (e) {
            if (e != 'tracing')
                throw e;
            rv = null;
        }
        // Cannot recursive trace
        if (rv === null) {
            this.restoreState(initialState);
            return null;
        }
        if (!(rv instanceof Context)) {
            this.restoreState(initialState);
            return rv;
        }

        // Determine state change
        const ntakes = initialState.stack.length - this.minStackSize;
        const ngives = this.stack.length - this.minStackSize;
        const takes = initialState.stack.slice(0, ntakes);
        const gives = this.stack.slice(-ngives);
        const delta = this.stack.length - initialState.stack.length;

        this.restoreState(initialState);
        return new TraceResults(takes, gives, delta);
    }

    /**
     *
     * @param {*} v
     * @returns {false|Object}
     */
    _getTraceResults(v) {
        // TODO also check takes datatypes and constexprs against stack
        for (let i = this.traceResults.length - 1; i >= 0; i--)
            if (this.traceResults[i].value === v)
                return this.traceResults[i];
        return false;
    }

    /**
     * Invoke macro or function
     * @param {value.Value} value
     * @param {Token} token
     * @returns {Context|error.SyntaxError} - success or failure
     */
    invoke(v, token, ignoreTraceCheck = false) {
        // TODO limit call stack (this.trace) to ~10000 or something
        // TODO instead of this bs we should detect recursion and then backtrack
        //   to where the original invocation so that there's less duplicated code

        // console.log("invoke:", (v.token && v.token.token) || v);

        // If not invokable just put it on the stack
        if (![value.ValueType.Fxn, value.ValueType.Macro].includes(v.type)) {
            this.push(v);
            return this;
        }

        // Check recursion
        const tResults = ignoreTraceCheck || this._getTraceResults(v, token);
        const recursive =
            // Builtin macro operators cannot be recursive (new rule ig)
            !(v.type === value.ValueType.Macro && !v.value.body) && (this.trace.includes(v.value) || (tResults === false && this.traceIO(v, token) === null));

        // const recursive = ;

        this.trace.push(v.value);
        if (this.trace.length > 1000) {
            throw new Error('max call stack exceeded');
        }

        // console.log('invk', token.token, recursive, tResults !== null && typeof tResults);
        // Invoke
        // TODO handle constexprs specially
        let ret = this;
        if (ignoreTraceCheck || !recursive) {
            // console.log('non rec', token.token, v.type);
            ret = this._toError(v.value.action(this, token), token);
        } else if (tResults.result === null) {
            this.trace.pop();
            // console.log('tracing: ', tResults, recursive);
            // console.log(new Error('tracing'));
            // throw 'tracing';
            return null;
            console.log('rec_trace', token.token);
            ret = null;
        } else if (tResults === false) {
            console.log('recursive:', token.token);
            const stack = this.stack.slice();
            this.stack = this.stack.map((v, i) =>
                new expr.RecursiveTakesExpr(v.token, v.datatype, this.stack.length - i, v));

            // Make body of (loop ...)
            const body = new expr.RecursiveBodyExpr(token);
            // Trace results not found, Handle recursive call
            const ios = this.traceIO(v, token);
            // Trace again, this time substituting trace results with recursive calls
            const ios2 = this.traceIO(v, token, { result: ios, body });

            // Populate body
            body.takeExprs = ios2.takes;
            body.gives = ios2.gives;

            // Generate results
            body.giveExprs = body.gives.map(e =>
                e.type === value.ValueType.Expr ? new expr.DependentLocalExpr(token. e.datatype, body) : e);

            // Update stack
            this.stack = stack;
            this.popn(ios2.takes.length);
            this.push(...body.giveExprs);
        } else {
            console.log('tail:', token.token);
            // This is an invocation of a recursive function body
            const { result, body } = tResults;
            // Create recursive function call expression using data from tResults
            const args = this.popn(result.takes.length);
            const callExpr = new expr.RecursiveCallExpr(token, body, args);
            // Note that if they're used after this it woudln't be tail recursion and would be unreachable
            this.push(...callExpr.giveExprs);

            ret = this;
        }

        // Clean up trace
        this.trace.pop();
        return ret;
    }

    /**
     * @param {*} v - value to convert to error
     * @param {Token} token - location in code
     * @returns {error.SyntaxError | Context}
     */
    _toError(v, token) {
        // Success
        if (v == null)
            return v;
        if (v == undefined)
            return this;
        if (v instanceof Context)
            return v;

        // Error
        if (v instanceof Array)
            v = new error.SyntaxError(v.map(e => `${token.token}: ${e}`).join('; '), token, this);
        if (v instanceof error.SyntaxError)
            v.tokens.push(token);
        return v;
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
    async outWast({ fast = false, folding = false, optimize = false, validate = false }) {
        // Create module from generated WAST
        const src = `(module \n${
            this.exports.map(e => e.out(this)).join('\n')
        })`;
        if (fast)
            return src;

        let mod;
        try {
            const wabt = await wabtProm;
            mod = wabt.parseWat("test", src, {
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
        } catch(e) {
            console.log('parse failed!');
            return src;
        }

        // Validate
        if (validate) {
            try {
                const invalid = mod.validate();
                if (invalid) {
                    console.error(invalid);
                    console.log(src);
                    return;
                }
            } catch (e) {
                console.log(src);
                throw e;
            }
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
     * @returns {*} - Wasm binary buffer
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

};

// Exports
module.exports = Context;
module.exports.TraceResults = TraceResults;
