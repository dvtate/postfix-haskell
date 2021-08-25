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

// TODO this should be refactored

/**
 * This stores expressions that we can reason about
 * but can't completly eliminate from the code.
 *
 * For example, operations on user input and not constant-values
 *
 * @abstract
 * @class
 */
export abstract class Expr extends value.Value {
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
     * Get all expressions which constitute this one
     * @returns child nodes
     * @virtual
     */
    children(): Expr[] {
        return [];
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
export abstract class DataExpr extends Expr {
    datatype: types.Type;

    /**
     * @param token - location in code
     * @param datatype - Datatype for value
     */
    constructor(token: LexerToken, datatype: types.Type) {
        super(token);
        this.datatype = datatype;
    }

    static expensive = false;
};

/**
 * Flatten a list of mixed values+expressions into a single list of expressions
 * @param vs array of values
 * @returns array of expressions
 */
function fromDataValue(vs: Array<DataExpr | value.Value>) {
    return vs.map(v => {
        if (v instanceof DataExpr)
            return v;

        if (v instanceof value.NumberValue)
            return new NumberExpr(v.token, v);
        if (v instanceof value.TupleValue)
            return fromDataValue(v.value);

        // Eww runtime error...
        throw new error.TypeError("incompatible type", v.token, v, null);
    }).reduce((a, v) =>
        v instanceof Array ? a.concat(v) : (a.push(v), a),
        [],
    );
}

/**
 * Describes branching action
 *
 * this should only get used when it cannot be determined which branch to take at compile time
 */
export class BranchExpr extends Expr {
    // Locations in source
    tokens: LexerToken[];

    // Condtions for brances
    conditions: Array<DataExpr>;

    // Actions for branches
    actions: Array<DataExpr>[];

    // Where results are delivered
    results: DependentLocalExpr[];

    /**
     * @param token - location in code
     * @param conditions - conditions for branches
     * @param actions - actions for brances
     */
    constructor(
        tokens: LexerToken[],
        conditions: Array<DataExpr|value.DataValue>,
        actions: Array<DataExpr|value.DataValue>[]
    ) {
        super(tokens[0]);
        this.tokens = tokens;
        this.conditions = fromDataValue(conditions);
        this.actions = actions.map(fromDataValue);
        this.results = [];
    }

    /**
     * @override
     */
    out(ctx: ModuleManager, fun: FunExportExpr) {
        // Prevent multiple compilations
        this._isCompiled = true;

        const conds = this.conditions.map(c => c.out(ctx, fun)).reverse();
        const acts = this.actions.map(a => a.map(v => v.out(ctx, fun)).join(' ')).reverse();
        const retType = this.actions[0].map(e => e.datatype.getWasmTypeName()).join(' ');
        const results = this.results.filter(r => !r.datatype.getBaseType().isVoid());

        // Add result datatypes
        results.forEach(r => {
            if (r.datatype instanceof types.PrimitiveType)
                r.index = fun.addLocal(r.datatype);
            // TODO handle others
        });

        // Last condition must be else clause
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
        let ret: string = (function compileIf(i) {
            return i + 1 >= acts.length
                ? acts[i]
                : `(if (result ${retType})${conds[i]
                    }\n\t(then ${acts[i]})\n\t(else ${compileIf(i + 1)}))`;
        })(0);

        ret += '\n\t' + results.map(r => `(local.set ${r.index})`).join();

        // console.log('BranchExpr', ret);
        return ret;
    }

    /**
     * @override
     */
    children(): Expr[] {
        return this.conditions.concat(this.actions.reduce((a, v)=>a.concat(v)));
    }
};

/**
 * Constant value that we're treating as an Expr
 */
export class NumberExpr extends DataExpr {
    value: value.NumberValue;

    /**
     * @param token - Location in code
     * @param value - Value to wrap
     */
    constructor(token: LexerToken, value: value.NumberValue) {
        super(token, value.datatype);
        this.value = value;
    }

    /**
     * @override
     */
    out(ctx: ModuleManager, fun: FunExportExpr) {
        const outValue = v => v instanceof value.TupleValue
            ? v.value.map(outValue).join()
            : v.value.toWAST();
        return outValue(this.value);
    }

    children() {
        return [];
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
    out(ctx: ModuleManager, fun: FunExportExpr) {
        return `(${this.instr} ${this.args.map(e => e.out(ctx, fun)).join(' ')})`;
    }

    static expensive = true;

    children() {
        return this.args;
    }
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

    out(ctx: ModuleManager, fun: FunExportExpr) {
        if (this.datatype.getBaseType().isVoid())
            return '';
        return `(local.get ${this.position})`;
    }
};

/**
 * Unused Result of an expression that can have multiple return values
 *
 * If the result is used we should use
 *
 * @deprecated
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
    constructor(token: LexerToken, datatype: types.Type, source: Expr, position: number) {
        super(token, datatype);
        this.source = source;
        this.position = position;
    }

    out(ctx: ModuleManager, fun: FunExportExpr) {
        return !this.source._isCompiled ? this.source.out(ctx, fun) : "";
    }

    children() {
        return [this.source];
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
    constructor(token: LexerToken, name: string, inputTypes: types.Type[]) {
        super(token);
        this.name = name;
        this.inputTypes = inputTypes.filter(t => !t.getBaseType().isVoid());
        this._locals = inputTypes.filter(t => !t.getBaseType().isVoid()).map(t => null);
    }

    /**
     * @param type - storage type for local
     * @returns - local index
     */
    addLocal(type: types.Type /*types.PrimitiveType*/): number {
        // TODO when given non-primitive type expand it to a list of primitives
        // new return type will be array
        return this._locals.push(type as types.PrimitiveType) - 1;
    }

    /**
     * Reserve space for value
     * @param type storage type for local
     * @param token source location
     * @returns local indicies
     */
    addLocals(type: types.Type, token: LexerToken | LexerToken[]): number[] {
        try {
            return type.flatPrimitiveList().map(this.addLocal);
        } catch (e) {
            throw e === 'union'
                ? new error.SyntaxError('Invalid union type', token)
                : e;
        }
    }

    // TODO should make apis to help lift nested functions/closures

    out(ctx: ModuleManager) {
        // TODO tuples
        const outs = this.outputs.map(o => o.out(ctx, this));
        const paramTypes = this.inputTypes.map(t => t.getWasmTypeName()).filter(Boolean).join(' ');
        const resultTypes = this.outputs.map(r => r.datatype.getWasmTypeName()).filter(Boolean).join(' ');

        return `(func (export "${this.name}") ${
            paramTypes ? `(param ${paramTypes})` : ''
        } ${
            resultTypes ? `(result ${resultTypes})` : ''
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
    out(ctx: ModuleManager, fun: FunExportExpr) {
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
 * Used to wrap arguments passed to recursive functions as they are being tracd in a way that
 * they can later be used to determine the bindings for parameters in
 * recursive calls within the body
 */
export class RecursiveTakesExpr extends DataExpr {
    negIndex: number;

    /**
     * @param token location in source code
     * @param datatype type of argument
     * @param negIndex stack index of argument
     * @param value value being passed as argument
     */
    constructor(token: LexerToken, datatype: types.Type, negIndex: number, value) {
        super(token, datatype);
        this.negIndex = negIndex;
        this.value = value;
    }

    out(ctx: ModuleManager, fun: FunExportExpr) {
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

    constructor(token: LexerToken) {
        super(token);

        // Unique labels
        this.id = RecursiveBodyExpr._uid++;
        this.label = `$rec_${this.id}`;
    }

    out(ctx: ModuleManager, fun: FunExportExpr) {
        // Prevent multiple compilations
        this._isCompiled = true;

        // console.log('takes', this.takeExprs);
        console.log('gives', this.gives.map(e => e.children()).reduce((a,b)=>a.concat(b)));

        // Filter out void types
        this.takeExprs = this.takeExprs.map(e => !e.datatype.getBaseType().isVoid() && e);
        this.giveExprs = this.giveExprs.map(e => !e.datatype.getBaseType().isVoid() && e);

        // Store inputs in locals
        this.takeExprs.forEach(e => {
            if (e)
                e.index = fun.addLocal(e.datatype);
        });
        let ret = `\n\t${this.takeExprs.map((e, i) =>
            `${this.takes[i].out(ctx, fun)}${e ? `\n\t(local.set ${e.index})` : ''}`
        ).join('\n\t')}\n\t`;

        // Create place to store outputs
        this.giveExprs.forEach(e => {
            if (e)
                e.index = fun.addLocal(e.datatype);
        });

        // Body
        const retType = this.gives.map(e => e.datatype.getWasmTypeName()).join(' ');
        ret += `(loop ${this.label} (result ${retType})\n\t`;
        ret += this.gives.map(e => e.out(ctx, fun)).join('\n\t');
        ret += `)\n\t${this.giveExprs.map(e => e ? `(local.set ${e.index})` : '').join(' ')}\n\t`;

        // console.log('RecursiveBodyExpr', ret);
        return ret;
    }

    children() {
        return this.takes
            .concat(this.takeExprs)
            .concat(this.gives)
            .concat(this.giveExprs);
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

    out(ctx: ModuleManager, fun: FunExportExpr) {
        // console.log('call', this.giveExprs);
        // Set arg locals
        let ret = `\n\t${this.takeExprs.map((e, i) =>
            `${e.out(ctx, fun)}${
                (!this.body.takeExprs[i] || e.datatype.getBaseType().isVoid())
                    ? '' : `\n\t(local.set ${this.body.takeExprs[i].index})`}`
        ).join('\n\t')}\n\t`;

        // Invoke function
        ret += `(br ${this.body.label})`;
        // console.log('RecursiveCallExpr', ret);
        return ret;
    }

    // Shouldn't matter because result shouldn't get used
    static expensive = true;

    children() {
        return this.body.children().concat(this.takeExprs).concat(this.giveExprs);
    }
};

/**
 * For when the output of an expression is stored in a local variable
 */
export class DependentLocalExpr extends DataExpr {
    source: Expr;
    index: number;

    constructor(token: LexerToken, datatype: types.Type, source: Expr) {
        super(token, datatype);
        this.source = source;
        this.index = -1;
    }

    out(ctx: ModuleManager, fun: FunExportExpr) {
        // source.out() will update our index to be valid

        return `${
            !this.source._isCompiled ? this.source.out(ctx, fun) : ''
        } ${
            this.datatype.getBaseType().isVoid() ? '' : `(local.get ${this.index})`
        }`;
    }

    children() {
        return this.source.children();
    }
};