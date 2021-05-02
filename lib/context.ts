import binaryen = require("binaryen");
import wabtMod = require("wabt");

import * as value from './value';
import * as types from './datatypes';
import * as error from './error';
import * as expr from './expr';
import { LexerToken } from "./scan";
import CompileContext from "./compile";

import debugMacros from './debug_macros';
import globalOps from './globals';
import WasmNumber from "./numbers";
import { throws } from "assert";


const wabtProm = wabtMod();

// Should probably make a ContextProxy class to help with tracing
// Or maybe just a clone method would be ok (but less efficient)

// Return Types for Context.traceIO() method
export class TraceResults {
    takes: value.Value[];
    gives: value.Value[];
    delta: number;

    constructor(takes: value.Value[], gives: value.Value[], delta: number) {
        this.takes = takes;
        this.gives = gives;
        this.delta = delta;
    }
};

interface TraceResultTracker {
    token: LexerToken,
    value: value.Value,
    result?: TraceResults,
    body?: expr.RecursiveBodyExpr,
}

/**
 * This class stores state assocated with the parser
 *
 * TODO remove public API's
 */
export default class Context {
    // Place to push/pop arugments & exprs
    stack: value.Value[] = [];

    // Exports
    module: any = {};

    // Identifier map
    scopes: Array<{ [k: string] : value.Value }> = [{}];

    // Invoke stack
    trace: value.Value[] = [];

    // Tracking for traceIO and recursion stuff
    traceResults: Array<TraceResultTracker | any> = [];
    globals: { [k: string] : value.Value };

    // Stack tracing cunters
    initialStackSize: number = 0;
    minStackSize: number = 0;

    // Warnings
    warnings: Array<{ token: LexerToken, msg: string }> = [];

    // Exports
    exports: Array<expr.FunExportExpr> = [];

    recursiveMacros: Set<value.Value> = new Set();

    // Some optimizations can be slow with larger projects
    optLevel: number;

    // Static data section of linear memory
    staticData: number[] = [];

    // Link external class
    static TraceResults = TraceResults;

    // Default constructor
    constructor(optLevel: number = 1) {
        this.optLevel = optLevel;

        // Initialize globals
        this.globals = {
            ...globalOps,    // Operators
            ...debugMacros, // Debug operators
        };
        Object.entries(types.PrimitiveType.Types).forEach(([typeName, type]) =>
            this.globals[typeName] = new value.Value(null, value.ValueType.Type, type)
        );
        this.globals['Any'] = new value.Value(null, value.ValueType.Type, new types.Type());
    }

    /**
     * Copy Context state
     * @returns {Object} - state copy object
     */
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


    /**
     * Restore copied state
     * @param {Object} obj - state copy object from Context.copyState()
     */
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
    getId(id, scopes?) {
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
     * Copy state/context
     *
     * @returns {Context} - Cloned Context instance
     */
    clone() {
        const ret = new Context();
        ret.restoreState(this.copyState());
        return ret;
    }

    /**
     * Get index for first value on stack that hasn't been seen before
     *
     * @deprecated
     * @param {number} old - index for first value on stack that hasn't been seen before
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
        // console.log('trace:', (token && token.token), 'known:', (!!knownResults.result));
        const rv = this.invoke(v, token, true);

        // Forward errors
        if (!(rv instanceof Context)) {
            this.restoreState(initialState);
            // if (rv === null) {
            //     console.log('null trace result!');
            // }
            return rv;
        }

        // Determine state change
        const ntakes = initialState.stack.length - this.minStackSize;
        const ngives = this.stack.length - this.minStackSize;
        const takes = initialState.stack.slice(0, ntakes);
        const gives = this.stack.slice(-ngives);
        const delta = this.stack.length - initialState.stack.length;
        // const delta = gives.length - takes.length;
        // console.log({
        //     ntakes, ngives, delta, takes, gives,
        // });

        this.restoreState(initialState);
        return new TraceResults(takes, gives, delta);
    }

    /**
     *
     * @param {*} v
     * @returns TraceResultTracker or null
     */
    _getTraceResults(v): TraceResultTracker {
        // TODO also check takes datatypes and constexprs against stack
        for (let i = this.traceResults.length - 1; i >= 0; i--)
            if (this.traceResults[i].value === v)
                return this.traceResults[i];
        return null;
    }

    /**
     * Invoke macro or function
     * @param v - value to invoke
     * @param token - location in source
     * @param isTrace - is this a trace invoke? or normal?
     * @returns - null if recursive trace, error.SyntaxError on error, this on success
     */
    invoke(v : value.Value, token: LexerToken, isTrace : boolean = false): Context | error.SyntaxError | null {
        // TODO this algorithm is extrememly complicated and confusing and inefficient
        //  there must be a simpler way... time spent to create: ~1 month

        if (v instanceof value.StrValue) {
            this.push(new value.NumberValue(token, new WasmNumber(WasmNumber.Type.I32, v.value.length)));
            this.push(new value.NumberValue(token, new WasmNumber(WasmNumber.Type.I32, this.addStaticData(v.value))));
            return this;
        }

        // If not invokable just put it on the stack
        if (![value.ValueType.Fxn, value.ValueType.Macro].includes(v.type)) {
            this.push(v);
            return this;
        }

        // Check recursion
        const recursiveInv = this.trace.includes(v.value);

        // Check trace status
        const tResults = this._getTraceResults(v);

        // console.log("invoke:", (token && token.token),
        //     'recursive:', recursiveInv,
        //     'results:', tResults ? (tResults.result && typeof tResults.result) : 'false');

        // Try to invoke normally
        // TODO handle constexprs specially
        if (!recursiveInv || isTrace) {
            const stack = this.stack.slice();
            const mss = this.minStackSize;
            try  {
                // console.log('non rec', token.token, v.type);
                this.trace.push(v.value);
                if (this.trace.length > 1000)
                    throw new Error('[parse] max call stack exceeded');
                const ret = this._toError(v.value.action(this, token), token);
                this.trace.pop();
                return ret;
            } catch (e) {
                // If the function throws our value then we know it's recursive
                if (e.value !== v.value) {
                    this.trace.pop();
                    throw e;
                }

                this.stack = stack;
                this.minStackSize = mss;
                // console.log('caught recursive');
                // recursive = true;
            }
        }

        // It's recursive and we didn't see it yet
        if (recursiveInv && (!tResults || tResults.result !== null) && !this.recursiveMacros.has(v.value))
            throw v;

        // if (!recursiveInv)
        //     console.log('proc recursive');

        // This is complicated because of recursion :(
        // TODO copy explanation from tg channel
        if (tResults === null) { // Not currently tracing
            // Trace results not found, Handle recursive call
            // TODO if all inputs are constexprs => inline/invoke simple

            // Replace stack with expression wrappers so that they can be replaced with locals later
            const stack = this.stack.slice();
            this.stack = this.stack.map((v, i) =>
                v instanceof expr.DataExpr || v instanceof value.DataValue
                ? new expr.RecursiveTakesExpr(v.token, v.datatype, this.stack.length - i, v)
                : v);

            // Identify value as recursive
            this.recursiveMacros.add(v.value);

            // Make body of (loop ...)
            const body = new expr.RecursiveBodyExpr(token);

            // Trace once to determine non-recursive case
            // console.log('trace 1');
            const ios = this.traceIO(v, token);
            if (!(ios instanceof TraceResults))
                return ios;

            // Link body inputs
            // Generate input locals
            if (!ios.takes)
                console.log(ios);
            body.takes = ios.takes as expr.DataExpr[];
            body.takeExprs = body.takes.map(e =>
                e.type === value.ValueType.Expr ? new expr.DependentLocalExpr(token, e.datatype, body) : null);

            // Generate results
            body.gives = ios.gives as expr.DataExpr[];
            body.giveExprs = body.gives.map(e =>
                e.type === value.ValueType.Expr ? new expr.DependentLocalExpr(token, e.datatype, body) : null);

            // Trace again, this time substituting non-recursive trace results with recursive calls
            this.stack = body.takeExprs.slice();
            // console.log('trace 2');
            const ios2 = this.traceIO(v, token, { result: ios, body });
            if (!(ios2 instanceof TraceResults))
                return ios2;

            // Done with it
            this.recursiveMacros.delete(v.value);

            // Update body
            body.gives = ios2.gives as expr.DataExpr[];
            // body.takes = ios2.takes;

            // Update stack
            this.stack = stack;
            this.popn(ios2.takes.length);
            this.push(...body.giveExprs);
            return this;

        } else if (tResults.result) { // Invoking an already traced recursive function
            // console.log('tail:', token.token);
            // This is an invocation of a recursive function in it's body
            const { result, body } = tResults;
            // Create recursive function call expression using data from tResults
            const args = this.popn(result.takes.length).reverse();
            const callExpr = new expr.RecursiveCallExpr(token, body, args);
            // Note that if they're used after this it woudln't be tail recursion and would be unreachable

            this.push(...callExpr.giveExprs);

            return this;
        } else if (tResults.result === null) {
            // Recursive tracing (bad!)
            // console.log('already tracing!', token.token);
            return null; // already tracing
        }

        throw new Error("Should not get here wtf???!");
        return this;
    }

    /**
     * Handles some unclean macro return values
     * @param v - value to convert to error
     * @param token - location in code
     */
    _toError(v, token: LexerToken): error.SyntaxError | Context | null {
        // Success
        if (v === undefined)
            return this;
        if (v === null)
            return v;
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
    push(...v : value.Value[]) {
        this.stack.push(...v);
    }

    /**
     * Pull value from stack
     * @returns {Value|undefined} - last value from stack
     */
    pop(): value.Value {
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
    popn(n: number): value.Value[] {
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
     * Store static data
     * @param d - data to save statically
     * @returns - memory address
     */
     addStaticData(d: Array<number> | Uint8Array | Uint16Array | Uint32Array | string): number {
        let bytes : Uint8Array;

        // Convert into array of bytes
        // TODO fix bithmaths lol
        if (d instanceof Uint32Array)
            bytes = new Uint8Array(d.reduce((a, c) => [
                ...a,
                c & ((1 << 8) - 1),
                c & ((1 << 16) - 1),
                c & ((1 << 24) - 1),
                (c >> 24) & ((1 << 8) - 1), // Downshift to avoid i32 overflow
            ], []));
        else if (d instanceof Uint16Array)
            bytes = new Uint8Array(d.reduce((a, c) => [
                ...a,
                c & ((1 << 8) - 1),
                c & ((1 << 16) - 1),
            ], []));
        else if (typeof d === 'string')
            bytes = new TextEncoder().encode(d); // u8array
        else if (d instanceof Uint8Array)
            bytes = d;
        else if (d instanceof Array)
            bytes = new Uint8Array(d);

        // TODO maybe handle bigints?

        // Check to see if same value already exists
        if (this.optLevel > 1)
            for (let i = 0; i < this.staticData.length; i++) {
                let j : number;
                for (j = 0; j < bytes.length; j++)
                    if (this.staticData[i + j] !== bytes[j])
                        break;

                // The data already exists
                if (j == bytes.length)
                    return i;
            }

        // Append to static data
        const ret = this.staticData.length;
        this.staticData.push(...bytes);
        return ret;
    }

    /**
     * Warn the user when something seems weird
     *
     * @param token - location in code
     * @param msg - what's wrong
     */
    warn(token: LexerToken, msg: string) {
        console.warn("WARNING: ", msg, token);
        this.warnings.push({ token, msg });
    }

    /**
     * Compiles program to WASM Text form
     * @param options - settings
     * @returns - WAST source code
     */
    async outWast({ fast = false, folding = false, optimize = false, validate = false }): Promise<string> {
        // Generate webassembly text
        const src = new CompileContext(this.exports, this.staticData).out();
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
     * Use Compiles program to WebAssembly Text and then uses WABT to convert to binary
     * @returns - Wasm binary buffer
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

        return mod.toBinary({log: true});
    }

};