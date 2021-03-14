const value = require('./value');
const { NumberValue } = require('./value');
const types = require('./datatypes');
const error = require('./error');

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
class Expr extends value.Value {
    /**
     * @param {Token} token
     */
    constructor(token) {
        super(token, value.ValueType.Expr, null);

        // State variable for if expr shouldn't be duplicated
        this._isCompiled = false;
    }

    /**
     * Compilation action
     * @virtual
     * @param {FunExportExpr} fun - function export context
     * @returns {string} - wasm translation
     */
    out(fun) {
        return '';
    }
};

// TODO is this used?
/**
 * Data Expressions
 * @abstract
 * @class
 */
class DataExpr extends Expr {
    /**
     * @param {Token} token - location in code
     * @param {Type} datatype - Datatype for value
     */
    constructor(token, datatype) {
        super(token);
        this.datatype = datatype;
    }
};

/**
 * Describes branching action
 *
 * this should only get used when it cannot be determined which branch to take at compile time
 */
class BranchExpr extends Expr {
    /**
     * @param {Token} token - location in code
     * @param {Expr[]} conditions - conditions for branches
     * @param {Expr[]} actions - actions for brances
     */
    constructor(tokens, conditions, actions) {
        super(tokens[0]);
        this.tokens = tokens;
        this.conditions = conditions;
        this.actions = actions;
    }

    /**
     * @override
     */
    out(fun) {
        // TODO convert to use if-else because it's less retarded
        // Prevent multiple compilations
        this._isCompiled = true;

        const conds = this.conditions.map(c => c.out(fun)).reverse();
        const acts = this.actions.map(a => a.map(v => v.out(fun)).join(' ')).reverse();
        const retType = this.actions[0].map(e => e.datatype.getWasmTypeName()).join(' ');

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
        const ret = (function compileIf(i) {
            return i + 1 >= acts.length
                ? acts[i]
                : `(if (result ${retType})${conds[i]
                    }\n\t(then ${acts[i]})\n\t(else ${compileIf(i + 1)}))`;
        })(0);

        // console.log('BranchExpr', ret);
        return ret;
    }
};

/**
 * Constant value that we're treating as an Expr
 */
class NumberExpr extends DataExpr {
    /**
     * @param {Token} token - Location in code
     * @param {DataValue} value - Value to wrap
     */
    constructor(token, value) {
        super(token, value.datatype);
        this.value = value;
    }

    /**
     * @override
     */
    out(fun) {
        const outValue = v => v instanceof value.TupleValue
            ? this.value.map(outValue).join()
            : this.value.toWAST();
        return outValue(this.value);
    }
};

/**
 * Passes stack arguments to desired WASM instruction
 */
class InstrExpr extends DataExpr {
    constructor(token, datatype, instr, args) {
        super(token, datatype);
        this.instr = instr;
        this.args = args;
    }

    /**
     * @override
     */
    out(fun) {
        return `(${this.instr} ${this.args.map(a => a.out(fun)).join(' ')})`;
    }
};

/**
 * Function parameters expression
 */
class ParamExpr extends DataExpr {
    /**
     * @param {Token} token - Locaation in code
     * @param {Type} datatype - Datatype for expr
     * @param {Expr} source - Origin expression
     * @param {number} position - Stack index (0 == left)
     */
    constructor(token, datatype, source, position) {
        super(token, datatype);
        this.source = source;
        this.position = position;
    }

    out(fun) {
        return `(local.get ${this.position})`;
    }
};

// TODO this doesn't work when user does swap or drop :(
//      all outputs must be accounted for in correct order
/**
 * Result of an expression that can have multiple return values
 */
class ResultExpr extends DataExpr {
    /**
     * @param {Token} token - Locaation in code
     * @param {Type} datatype - Datatype for expr
     * @param {Expr} source - Origin expression
     * @param {number} position - Stack index (0 == left)
     */
    constructor(token, datatype, source, position) {
        super(token, datatype);
        this.source = source;
        this.position = position;
    }

    out(fun) {
        return !this.source._isCompiled ? this.source.out(fun) : "";
    }
};

/**
 * Function Export expression
 */
class FunExportExpr extends Expr {
    /**
     * @param {Token} token - Source location
     * @param {string} name - Export label
     * @param {PrimitiveType[]} inputTypes - Types for input values
     * @param {Expr[]} outputs - Generated exprs for return values
     */
    constructor(token, name, inputTypes, outputs) {
        super(token);
        this.name = name;
        this.inputTypes = inputTypes;
        this.outputs = outputs;
        this._locals = inputTypes.map(t => null);
    }

    /**
     * @param {types.PrimitiveType} type - storage type for local
     * @returns {number} - local index
     */
    addLocal(type) {
        if (!(type instanceof types.PrimitiveType))
            throw new Error("todo non-primmitive types..");
        return this._locals.push(type) - 1;
    }

    out() {
        // TODO tuples
        const outs = this.outputs.map(o => o.out(this));
        return `(func (export "${this.name}") ${
            this.inputTypes.map((t, i) => `(param ${t.getBaseType().name})`).join(' ')
        } (result ${this.outputs.map(o => o.datatype.getBaseType().name).join(' ')})\n\t\t${
            this._locals.filter(Boolean).map(l => `(local ${l.getWasmTypeName()})`).join(' ')
        }\n\t${
            outs.join('\n\t')
        })`;
    }
};

class RecursiveTakesExpr extends Expr {
    constructor(token, datatype, negIndex, value) {
        super(token);
        this.datatype = datatype;
        this.negIndex = negIndex;
        this.value = value;
    }

    out(fun) {
        return this.value.out(fun);
    }
};

class RecursiveBodyExpr extends Expr {
    static _uid = 0;
    constructor(token, takes = null, gives = null) {
        super(token);

        // Input exprs
        this.takes = takes;

        // Input locals
        this.takeExprs = null;

        // Output exprs
        this.gives = gives;

        // Output locals
        this.giveExprs = null;

        // Unique labels
        this.id = RecursiveBodyExpr._uid++;
        this.label = `$rec_${this.id}`;
    }

    out(fun) {
        // Prevent multiple compilations
        this._isCompiled = true;

        // Store inputs in locals
        this.takeExprs.forEach(e => {
            e.index = fun.addLocal(e.datatype);
        });
        let ret = `\n\t${this.takeExprs.map((e, i) =>
            `${this.takes[i].out(fun)}\n\t(local.set ${e.index})`
        ).join('\n\t')}\n\t`;

        // Create place to store outputs
        const indicies = this.giveExprs.map(e => (e.index = fun.addLocal(e.datatype)));

        // Body
        const retType = this.gives.map(e => e.datatype.getWasmTypeName()).join(' ');
        ret += `(loop ${this.label} (result ${retType})\n\t`;
        ret += this.gives.map(e => e.out(fun)).join('\n\t');
        ret += `)\n\t${this.giveExprs.map(e => `(local.set ${e.index})`).join(' ')}\n\t`;

        // console.log('RecursiveBodyExpr', ret);
        return ret;
    }
};

/**
 * Recursive calls within function body
 */
class RecursiveCallExpr extends Expr {
    constructor(token, body, takeExprs) {
        super(token);
        this.takeExprs = takeExprs;
        this.body = body;
        this.giveExprs = body.giveExprs.map((e, i) =>
            new ResultExpr(token, e.datatype, this, i));
    }

    out(fun) {
        // Set arg locals
        let ret = `\n\t${this.takeExprs.map((e, i) =>
            `${e.out(fun)}\n\t(local.set ${this.body.takeExprs[i].index})`
        ).join('\n\t')}\n\t`;

        // Invoke function
        ret += `(br ${this.body.label})`;
        // console.log('RecursiveCallExpr', ret);
        return ret;
    }
};

/**
 * For when the output of an expression is stored in a local variable
 */
class DependentLocalExpr extends Expr {
    constructor(token, datatype, source) {
        super(token);
        this.datatype = datatype;
        this.source = source;
        this.index = -1;
    }

    out(fun) {
        // source.out() will update our index to be valid
        return `${!this.source._isCompiled ? this.source.out(fun) : ''
            }(local.get ${this.index})`;
    }
};

module.exports = {
    Expr,
    DataExpr,
    BranchExpr,
    NumberExpr,
    InstrExpr,
    FunExportExpr,
    ParamExpr,
    ResultExpr,
    RecursiveCallExpr,
    RecursiveBodyExpr,
    RecursiveTakesExpr,
    DependentLocalExpr,
};