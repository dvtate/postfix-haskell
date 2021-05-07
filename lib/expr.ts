import * as value from './value';
import * as types from './datatypes';
import * as error from './error';
import { LexerToken } from './scan';
import ModuleManager from './module';

/*
 * This file contains datatypes related to a graph IR used to output webassembly
 *
 * All errors should be presented to the user before this point
 */

// TODO pass contextual expressions to children as array so that they can manage locals and such
// IDEA make a type for WAST code that makes debugging easier as we can determine where each part came from

/**
 * This stores expressions that we can reason about
 * but can't completly eliminate from the code.
 *
 * For example, operations on user input and not constant-values
 *
 * @abstract
 * @class
 */
export class Expr extends value.Value {
    // State variable to prevent duplicated compilation
    _isCompiled: boolean = false;

    /**
     * @constructor
     * @param token - Source location
     */
    constructor(token: LexerToken) {
        super(token, value.ValueType.Expr, undefined);
    }

    /**
     * Compilation action
     * @virtual
     * @param fun - function export context
     * @returns - wasm translation
     */
    out(ctx: ModuleManager, fun?: FunExportExpr): string {
        return '';
    }

    /**
     * Would it be better to store the value in a local or inline it multiple times?
     * @virtual
     */
    static expensive = true;
};

/**
 * Data Expressions
 * @abstract
 * @class
 */
export class DataExpr extends Expr {
    datatype: types.Type;

    /**
     * @param token - location in code
     * @param datatype - Datatype for value
     */
    constructor(token, datatype) {
        super(token);
        this.datatype = datatype;
    }

    static expensive = false;
};

/**
 * Describes branching action
 *
 * this should only get used when it cannot be determined which branch to take at compile time
 */
export class BranchExpr extends Expr {
    // Locations in source
    tokens: LexerToken[];

    // Condtions for brances
    conditions: DataExpr[];

    // Actions for branches
    actions: DataExpr[][];

    // Where results are delivered
    results: DependentLocalExpr[];

    /**
     * @param token - location in code
     * @param conditions - conditions for branches
     * @param actions - actions for brances
     */
    constructor(tokens, conditions, actions) {
        super(tokens[0]);
        this.tokens = tokens;
        this.conditions = conditions;
        this.actions = actions;
        this.results = [];
    }

    /**
     * @override
     */
    out(ctx, fun) {
        // Prevent multiple compilations
        this._isCompiled = true;

        const conds = this.conditions.map(c => c.out(ctx, fun)).reverse();
        const acts = this.actions.map(a => a.map(v => v.out(ctx, fun)).join(' ')).reverse();
        const retType = this.actions[0].map(e => e.datatype.getWasmTypeName()).join(' ');

        // Add result datatypes
        this.results.forEach(r => { r.index = fun.addLocal(r.datatype); });

        // Last condition must be else clause
        // TODO move this to function.js
        if (conds[conds.length - 1] != '(i32.const 1)') {
            // console.log(conds[conds.length - 1]);
            throw new error.SyntaxError("no else case for fun branch", this.tokens);
        }

        // // n+1 blocks
        // let ret = "";
        // ret += `(block $branch (result ${retType}) `;
        // for (let i = 0; i < conds.length; i++)
        //     ret += '(block ';

        // // add conds
        // conds.forEach((c, i) => {
        //    ret += ` ${c}`;
        //    ret += ` (br_if ${i})`;
        // });

        // acts.forEach((a, i) => {
        //     ret += ')';
        //     ret += ` ${a}`;
        //     if (conds.length - i - 1 > 0)
        //         ret += `(br $branch)`;
        // });

        // ret += ')';
        // return ret;

        // Compile to (if (...) (result ...) (then ...) (else ...))
        let ret = (function compileIf(i) {
            return i + 1 >= acts.length
                ? acts[i]
                : `(if (result ${retType})${conds[i]
                    }\n\t(then ${acts[i]})\n\t(else ${compileIf(i + 1)}))`;
        })(0);

        ret += '\n\t' + this.results.map(r => `(local.set ${r.index})`).join();

        // console.log('BranchExpr', ret);
        return ret;
    }
};

/**
 * Constant value that we're treating as an Expr
 */
export class NumberExpr extends DataExpr {
    /**
     * @param token - Location in code
     * @param value - Value to wrap
     */
    constructor(token, value) {
        super(token, value.datatype);
        this.value = value;
    }

    /**
     * @override
     */
    out(ctx, fun) {
        const outValue = v => v instanceof value.TupleValue
            ? this.value.map(outValue).join()
            : this.value.toWAST();
        return outValue(this.value);
    }
};

/**
 * Passes stack arguments to desired WASM instruction
 */
export class InstrExpr extends DataExpr {
    // WASM instruction mnemonic
    instr: string;

    // Arguments passed
    args: DataExpr[];

    constructor(token, datatype, instr, args) {
        super(token, datatype);
        this.instr = instr;
        this.args = args;
    }

    /**
     * @override
     */
    out(ctx, fun) {
        return `(${this.instr} ${this.args.map(e => e.out(ctx, fun)).join(' ')})`;
    }

    static expensive = true;
};

/**
 * Function parameters expression
 */
export class ParamExpr extends DataExpr {
    // Origina FuncExportExpr
    source: DataExpr;

    // Parameter Index
    position: number;

    /**
     * @param token - Locaation in code
     * @param datatype - Datatype for expr
     * @param source - Origin expression
     * @param position - Stack index (0 == left)
     */
    constructor(token, datatype, source, position) {
        super(token, datatype);
        this.source = source;
        this.position = position;
    }

    out(ctx, fun) {
        if (this.datatype.getBaseType().isVoid())
            return '';
        return `(local.get ${this.position})`;
    }
};

/**
 * Unused Result of an expression that can have multiple return values
 *
 * If the result is used we should use
 */
export class UnusedResultExpr extends DataExpr {
    // Orign expression
    source: Expr;

    // Stack index
    position: number;

    /**
     * @param token - Locaation in code
     * @param datatype - Datatype for expr
     * @param source - Origin expression
     * @param position - Stack index (0 == left)
     */
    constructor(token, datatype, source, position) {
        super(token, datatype);
        this.source = source;
        this.position = position;
    }

    out(ctx, fun) {
        return !this.source._isCompiled ? this.source.out(ctx, fun) : "";
    }
};

/**
 * Function Export expression
 */
export class FunExportExpr extends Expr {
    // Exported symbol
    name: string;

    // Parameter types
    inputTypes: types.Type[];

    // Output expressions
    outputs: Array<DataExpr | value.NumberValue> = [];

    // Locals
    _locals: Array<null|types.PrimitiveType>;

    /**
     * @param token - Source location
     * @param name - Export label
     * @param inputTypes - Types for input values
     * @param outputs - Generated exprs for return values
     */
    constructor(token, name, inputTypes: types.Type[]) {
        super(token);
        this.name = name;
        this.inputTypes = inputTypes.filter(t => !t.getBaseType().isVoid());
        this._locals = inputTypes.map(t => null);
    }

    /**
     * @param type - storage type for local
     * @returns - local index
     */
    addLocal(type: types.PrimitiveType): number {
        return this._locals.push(type) - 1;
    }

    // TODO should make apis to help lift nested functions/closures

    out(ctx) {
        // TODO tuples
        const outs = this.outputs.map(o => o.out(ctx, this));
        const paramTypes = this.inputTypes.map(t => t.getWasmTypeName()).filter(Boolean).join(' ');
        const resultTypes = this.inputTypes.map(t => t.getWasmTypeName()).filter(Boolean).join(' ');

        return `(func (export "${this.name}") ${
            paramTypes ? `(param ${paramTypes})` : ''
        } ${
            resultTypes ? `(param ${paramTypes})` : ''
        }\n\t\t${
            this._locals.filter(Boolean).map(l => `(local ${l.getWasmTypeName()})`).join(' ')
        }\n\t${
            outs.join('\n\t')
        })`;
    }
};

/**
 * Used for repeated expressions
 * Normally we'd try to use something like dup but wasm weird
 * First time it's compiled it stores value in a new local
 * After that it just does local.get
 */
export class TeeExpr extends DataExpr {
    local: null | number = null;

    /**
     * @param token - origin in source code
     * @param expr - value to store in a local so that we can copy it
     */
    constructor(token, expr: DataExpr) {
        super(token, expr.datatype);
        this.value = expr;
    }

    /**
     * @override
     */
    out(ctx, fun) {
        if (this.local === null) {
            this.local = fun.addLocal(this.datatype);
            return `${this.value.out(ctx, fun)}\n\t${
                this.datatype.getBaseType().isVoid() ? '' : `(local.tee ${this.local})`
            }`;
        }
        return this.datatype.getBaseType().isVoid() ? '' : `(local.get ${this.local})`;
    }

    // Prevent this from getting re-tee'd
    static expensive = false;
};

/**
 * Used to wrap arguments passed to recursive functions in a way that
 * they can later be used to determine the bindings for parameters in
 * recursive calls within the body
 */
export class RecursiveTakesExpr extends DataExpr {
    negIndex: number;

    /**
     * @constructor
     * @param token
     * @param datatype
     * @param negIndex
     * @param value
     */
    constructor(token, datatype, negIndex: number, value) {
        super(token, datatype);
        this.negIndex = negIndex;
        this.value = value;
    }

    out(ctx, fun) {
        return this.value.out(ctx, fun);
    }
};

/**
 * The body of the inlined, TCO'd recursive function
 * (replaces call that initiates the recursion)
 */
export class RecursiveBodyExpr extends Expr {
    // Input expressions
    takes: Array<DataExpr> = null;
    // Input Locals
    takeExprs: DependentLocalExpr[] = null;
    // Output expressions
    gives: Array<DataExpr> = null;
    // Output locals
    giveExprs: DependentLocalExpr[] = null;

    // Unique labels
    id: number;
    label: string;

    // Used to make unique label
    static _uid = 0;

    constructor(token) {
        super(token);

        // Unique labels
        this.id = RecursiveBodyExpr._uid++;
        this.label = `$rec_${this.id}`;
    }

    out(ctx, fun) {
        // Prevent multiple compilations
        this._isCompiled = true;

        // Store inputs in locals
        this.takeExprs.forEach(e => {
            e.index = fun.addLocal(e.datatype);
        });
        let ret = `\n\t${this.takeExprs.map((e, i) =>
            `${this.takes[i].out(ctx, fun)}\n\t(local.set ${e.index})`
        ).join('\n\t')}\n\t`;

        // Create place to store outputs
        this.giveExprs.forEach(e => { e.index = fun.addLocal(e.datatype); });

        // Body
        const retType = this.gives.map(e => e.datatype.getWasmTypeName()).join(' ');
        ret += `(loop ${this.label} (result ${retType})\n\t`;
        ret += this.gives.map(e => e.out(ctx, fun)).join('\n\t');
        ret += `)\n\t${this.giveExprs.map(e => `(local.set ${e.index})`).join(' ')}\n\t`;

        // console.log('RecursiveBodyExpr', ret);
        return ret;
    }
};

/**
 * Recursive calls within function body
 */
export class RecursiveCallExpr extends Expr {
    takeExprs: DependentLocalExpr[];
    body: RecursiveBodyExpr;
    giveExprs: UnusedResultExpr[];

    constructor(token, body, takeExprs) {
        super(token);
        this.takeExprs = takeExprs;
        this.body = body;

        // Here we can use ResultExpr's because using it violates tail-recursion
        //  thus we don't have to worry about them getting out of order
        this.giveExprs = body.giveExprs.map((e, i) =>
            new UnusedResultExpr(token, e.datatype, this, i));
    }

    out(ctx, fun) {
        // Set arg locals
        let ret = `\n\t${this.takeExprs.map((e, i) =>
            `${e.out(ctx, fun)}\n\t(local.set ${this.body.takeExprs[i].index})`
        ).join('\n\t')}\n\t`;

        // Invoke function
        ret += `(br ${this.body.label})`;
        // console.log('RecursiveCallExpr', ret);
        return ret;
    }

    // Shouldn't matter because result shouldn't get used
    static expensive = true;
};

/**
 * For when the output of an expression is stored in a local variable
 */
export class DependentLocalExpr extends DataExpr {
    source: Expr;
    index: number;
    constructor(token, datatype, source) {
        super(token, datatype);
        this.source = source;
        this.index = -1;
    }

    out(ctx, fun) {
        // source.out() will update our index to be valid
        return `${!this.source._isCompiled ? this.source.out(ctx, fun) : ''
            }(local.get ${this.index})`;
    }
};