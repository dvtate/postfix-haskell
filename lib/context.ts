import * as fs from 'fs';

import binaryen = require("binaryen");
import wabtMod = require("wabt");

import * as value from './value';
import * as types from './datatypes';
import * as error from './error';
import * as expr from './expr';
import { BlockToken, LexerToken } from "./scan";
import WasmNumber from "./numbers";
import debugMacros from './debug_macros';
import globalOps from './globals';
import ModuleManager, { CompilerOptions } from "./module";
import { LiteralMacro, Macro } from "./macro";
import { formatErrorPos } from '../tools/util';
import { Namespace } from './namespace';
import Fun from './function';

// Load wabt on next tick
const wabtProm = wabtMod();

// TODO this class is fucking massive and should be split into different components
//  so that the amount of state it manages is more segregated clear

// Return Types for Context.traceIO() method
export class TraceResults {
    /**
     * Consumed by operation
     */
    takes: value.Value[];

    /**
     * Results of operation
     */
    gives: value.Value[];

    /**
     * Difference in lengths
     */
    delta: number;

    constructor(takes: value.Value[], gives: value.Value[], delta: number) {
        this.takes = takes;
        this.gives = gives;
        this.delta = delta;
    }
}

/**
 * Used for storing result of a Macro trace
 */
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

    // Identifier map
    scopes: Array<{ [k: string] : value.Value }> = [{}];

    // Invoke stack
    trace: value.Value[] = [];

    // Tracking for traceIO and recursion stuff
    traceResults: Array<TraceResultTracker | any> = [];
    globals: { [k: string] : value.Value };

    // Stack tracing cunters
    initialStackSize = 0;
    minStackSize = 0;

    // Warnings
    warnings: Array<{ token: LexerToken, msg: string }> = [];

    // WebAssembly Module imports and exports
    module: ModuleManager;

    // Some optimizations can be slow with larger projects
    optLevel: number;

    // Link external class
    static TraceResults = TraceResults;

    // Recycled `include` namespaces
    includedFiles: { [k: string]: Namespace } = {};

    // Default constructor
    constructor(private entryPoint?: string, opts: CompilerOptions = {}) {
        // Initialize Module Manager
        this.optLevel = opts.optLevel || 2;
        this.module = new ModuleManager(this, opts);

        // Initialize globals
        this.globals = {
            ...globalOps,    // Operators
            ...debugMacros, // Debug operators
        };
        Object.entries(types.PrimitiveType.Types).forEach(([typeName, type]) =>
            this.globals[typeName] = new value.Value(null, value.ValueType.Type, type));
        this.globals['Any'] = new value.Value(null, value.ValueType.Type, new types.AnyType());
        this.globals['global'] = new value.NamespaceValue(null, new Namespace(this.globals));

        // If there's an entry file we need to track imports to it
        if (entryPoint)
            this.includedFiles[fs.realpathSync(entryPoint)] = new Namespace(this.scopes[0]);
    }

    /**
     * Copy Context state
     * @returns {Object} - state copy object
     */
    copyState() {
        // Copy data
        const ret = {
            stack: this.stack,
            scopes: this.scopes,
            globals: this.globals,
            initialStackSize: this.initialStackSize,
            minStackSize: this.minStackSize,
            warnings: this.warnings,
            module: this.module,

            // Prob not needed...
            trace: this.trace,
            traceResults: this.traceResults,
        };

        // Make copies of all the state data
        this.restoreState({
            stack: [...this.stack],
            scopes: [...this.scopes.map(s => ({...s}))],
            globals: {...this.globals},
            initialStackSize: this.initialStackSize,
            minStackSize: this.minStackSize,
            warnings: [...this.warnings],
            module: this.module.clone(),

            // Prob not needed...
            trace: [...this.trace],
            traceResults: [...this.traceResults],
        });

        return ret;
    }

    /**
     * Restore copied state
     * @param obj - state copy object from Context.copyState()
     */
    restoreState(obj: any) {
        this.stack = obj.stack;
        this.scopes = obj.scopes;
        this.globals = obj.globals;
        this.initialStackSize = obj.initialStackSize;
        this.minStackSize = obj.minStackSize;
        this.warnings = obj.warnings;
        this.trace = obj.trace;
        this.traceResults = obj.traceResults;
        this.module = obj.module;
    }

    /**
     * Look up identifier
     *
     * @param id - identifier
     * @returns returns value stored if found
     */
    getId(id : string[]): value.Value | undefined {
        // Resolve Local
        let ret : value.Value;
        for (let i = this.scopes.length - 1; i >= 0; i--)
            if (this.scopes[i][id[0]]) {
                ret = this.scopes[i][id[0]];
                break;
            }

        // Resolve Global
        if (!ret)
            ret = this.globals[id[0]];

        // Resolve namespaces
        for (let i = 1; i < id.length; i++)
            if (ret instanceof value.NamespaceValue)
                ret = ret.value.getId(id[i]);
            else
                return undefined;
        return ret;
    }

    /**
     * Store value into identifier
     *
     * @param id - identifier
     * @param value - value to set identifier to
     */
    setId(id: string[], v: value.Value, token: LexerToken) {
        // Handle fast case first
        if (id.length == 1) {
            this.scopes[this.scopes.length - 1][id[0]] = v;
            return;
        }

        // Resolve Local
        let scope : value.Value;
        for (let i = this.scopes.length - 1; i >= 0; i--)
            if (this.scopes[i][id[0]]) {
                scope = this.scopes[i][id[0]];
                break;
            }

        // Resolve Global
        if (!scope)
            scope = this.globals[id[0]];

        // Resolve namespaces
        for (let i = 1; i < id.length - 1; i++)
            if (!(scope instanceof value.NamespaceValue))
                return new error.SyntaxError(
                    `expected '${id.slice(0, i).join('.')}.' to be a namespace`,
                    token,
                    this);
            else
                scope = scope.value.getId(id[i]);

        (scope as value.NamespaceValue).value.scope[id[id.length - 1]] = v;
    }

    /**
     * Get index for first value on stack that hasn't been seen before
     *
     * @param old - index for first value on stack that hasn't been seen before
     * @deprecated
     */
    cmpStack(old: value.Value[]) {
        let i = 0;
        for (; i < old.length; i++)
            if (this.stack[i] !== old[i])
                return i;
        return i;
    }

    /**
     * Determine number of inputs and outputs
     * @param v - value to invoke
     * @param knownResults - trace results to use for recursion
     */
    traceIO(v: value.Value, token: LexerToken, knownResults: null | error.SyntaxError | object = { result: null, body: null }) {
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

        // console.log(this.stack, this.minStackSize);
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
        const takes = initialState.stack.slice(0, ntakes); // TODO this is probably wrong
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
    _getTraceResults(v: value.Value): TraceResultTracker {
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
    invoke(v : value.Value, token: LexerToken, isTrace = false): Context | error.SyntaxError | null {
        // TODO this algorithm is extrememly complicated and confusing and inefficient
        //  there must be a simpler way... time spent to create: ~1 month

        // When invoked static strings get their address and length pushed onto the stack
        if (v instanceof value.StrValue) {
            this.push(new value.NumberValue(token, new WasmNumber(WasmNumber.Type.I32, v.value.length)));
            this.push(new value.NumberValue(token, new WasmNumber(WasmNumber.Type.I32, this.module.addStaticData(v.value, true))));
            return this;
        }

        // If not invokable just put it on the stack
        if (![value.ValueType.Fxn, value.ValueType.Macro].includes(v.type)) {
            this.push(v);
            return this;
        }

        // Try to invoke normally
        if (v.value instanceof Fun) {
            this.trace.push(v);
            if (this.trace.length > 1000) {
                console.warn('1000 invocations reached, you probably forgot to use `rec`');
                throw new error.SyntaxError('Semantics max call stack exceeded', this.trace.map(v => v.token), this);
            }
            const ret = this.toError(v.value.action(this, token), token);
            this.trace.pop();
            return ret;
        }

        // Make typescript do it's thing
        if (!(v instanceof Macro))
            throw new Error('wtf?');

        // Type check
        if (!v.checkInputs(this.stack))
            return new error.SyntaxError('Type mismatch', token, this);

        // TODO handle constexprs specially
        if (!v.recursive || isTrace) {
            // console.log('non rec', token.token, v.type);
            this.trace.push(v);
            if (this.trace.length > 1000) {
                console.warn('1000 invocations reached, you probably forgot to use `rec`');
                // const toks = this.trace.map(t => t && t.token?.token);
                // console.info('Tokens: ',
                //     toks.slice(0, 20).join(', '),
                //     ' ... ', toks.slice(-20).join(', '));
                // const trace = this.trace.slice(0, 10).map(v => v.token)
                //     .concat(this.trace.slice(-10).map(v => v.token));
                throw new error.SyntaxError('Max call stack exceeded', this.trace.map(v => v.token), this);
            }
            const ret = this.toError(v.action(this, token), token);
            this.trace.pop();
            return ret;
        }

        // This is complicated because of recursion :(
        // TODO copy explanation from tg channel
        const tResults = this._getTraceResults(v);
        if (tResults === null) { // Not currently tracing
            // Trace results not found, Handle recursive call
            // TODO if all inputs are constexprs => inline/invoke simple

            // Replace stack with expression wrappers so that they can be replaced with locals later
            const stack = this.stack.slice();
            this.stack = this.stack.map((v, i) =>
                v instanceof expr.DataExpr || v instanceof value.DataValue
                ? new expr.RecursiveTakesExpr(v.token, v.datatype, this.stack.length - i, v)
                : v);

            // Make body of (loop ...)
            const body = new expr.RecursiveBodyExpr(token);

            // Trace once to determine non-recursive case
            // console.log('trace 1');
            const ios = this.traceIO(v, token);
            if (!(ios instanceof TraceResults))
                return ios;
            if (!ios.takes)
                throw new Error("wtf?");

            // If all inputs are constexprs, invoke at compile-time
            const isConstExpr = !stack
                .slice(stack.length - ios.takes.length)
                .some(v =>
                    v.type === value.ValueType.Expr
                    // && !(v.datatype && v.datatype.isUnit())
                    );
            if (isConstExpr) {
                this.warn(token, 'expanding constexpr');
                this.trace.push(v);
                try {
                    this.stack = stack;
                    const ret = this.toError(v.action(this, token), token);
                    this.trace.pop();
                    return ret;
                } catch (e) {
                    this.trace.pop();
                    throw e;
                }
            }

            // Link body inputs
            // Generate input locals
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
            // This is an invocation of a recursive function within it's body
            const { result, body } = tResults;

            // Get args to recursive call
            const args = this.popn(result.takes.length).reverse();
            for (let i = 0; i < args.length; i++)
                if (!args[i].out)
                    // TODO this shouldn't suck so bad :(
                    return new error.SyntaxError(`cannot pass abstract value ${args[i]} in recursive call`, token, this);

            const callExpr = new expr.RecursiveCallExpr(token, body, args as expr.DataExpr[]);
            // Note that if they're used after this it woudln't be tail recursion and would be unreachable

            this.push(...callExpr.giveExprs);

            return this;
        } else if (tResults.result === null) {
            // Recursive tracing
            // console.log('already tracing!', token.token);
            // console.log('already tracing!', token);
            // console.log(new Error().stack);
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
    toError(v: unknown, token: LexerToken): error.SyntaxError | Context | null {
        // Success
        if (v === undefined)
            return this;
        if (v === null || v instanceof Context)
            return v;

        // Error
        if (v instanceof Array)
            return new error.SyntaxError(v.map(e => `${token.token}: ${e}`).join('; '), token, this);
        if (v instanceof error.SyntaxError) {
            v.tokens.push(token);
            return v;
        }

        console.error('wtf?', v);
        throw new Error('unknown value recieved');
    }

    /**
     * Parse a tuple literal into a value
     * @param t token for tuple
     * @returns this | error
     */
    parseTuple(t: BlockToken, isType = false) {
        // Copy stack length
        const sl = this.stack.length;

        // Invoke body
        const ret = this.invoke(new LiteralMacro(this, t), t);

        // Create tuple from values pushed onto stack
        if (sl > this.stack.length)
            return new error.SyntaxError('invalid tuple, takes more values than gives', t, this);
        const vs = this.stack.splice(sl);

        // Get return value
        const val = (isType && !vs.length)
            || (vs.length && vs.every(v => v.type === value.ValueType.Type))
                ? new value.Value(t, value.ValueType.Type,
                    new types.TupleType(t, vs.map(v => v.value as types.Type)))
                : new value.TupleValue(t, vs);

        // Push value and exit with original status
        this.push(val);
        return ret;
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
     * @returns - last value from stack
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
     * Warn the user when something seems weird
     *
     * @param token - location in code
     * @param msg - what's wrong
     */
    warn(token: LexerToken, msg: string) {
        // console.warn("WARNING: ", msg, token);
        console.warn(formatErrorPos([{
            name: 'Warning',
            message: `Warning: ${msg}`,
            tokens: [token],
            stack: new Error().stack
        }]));
        this.warnings.push({ token, msg });
    }

    /**
     * Compiles program to WASM Text form
     * @param options - settings
     * @returns - WAST source code
     */
    async outWast({ fast = false, folding = false, optimize = false, validate = false }): Promise<string> {
        // Generate webassembly text
        const src = this.module.compile();
        if (fast)
            return src;

        // Verify syntax and pp
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
            console.error('parse failed!');
            return src;
        }

        // Validate
        if (validate) {
            try {
                const invalid = Boolean(mod.validate());
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
            const m2 = binaryen.readBinary(mod.toBinary({}).buffer);
            m2.optimize();
            m2.validate();
            return folding ? m2.emitText() : m2.emitStackIR();
        }

        // Return formatted wat
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
        // Get wasm text and load it into wabt
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

        // Generate wasm binary
        mod.validate();
        return mod.toBinary({log: true});
    }
}