const { NumberValue } = require('./value');
const value = require('./value');
const types = require('./datatypes');


/**
 * This stores expressions that we can reason about
 * but can't completly eliminate from the code.
 *
 * For example, operations on user input and not constant-values
 */
class Expr extends value.Value {
    /**
     * @param {Token} token
     */
    constructor(token) {
        super(token, value.ValueType.Expr, null);
    }

    /**
     * Compilation action
     * @virtual
     * @returns {string} - wasm translation
     */
    out() {
        return '';
    }
};

/**
 * Data Expressions
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
    out() {
        const n = this.conditions.length;
        const conds = this.conditions.map(c => c.out()).reverse();
        const acts = this.actions.map(a => a.map(v => v.out()).join(' ')).reverse();
        const retType = this.actions[0].map(e => e.datatype.getWasmTypeName()).join(' ');

        // n+1 blocks
        let ret = "";
        ret += `(block $topmost (result ${retType}) `;
        for (let i = 0; i < n; i++)
            ret += '(block ';

        // add conds
        conds.forEach((c, i) => {
           ret += ` ${c}`;
           ret += ` (br_if ${i})`;
        });

        acts.forEach((a, i) => {
            ret += ')';
            ret += ` ${a}`;
            if (n - i - 1 > 0)
                ret += `(br $topmost)`;
        });

        ret += ')';
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
    out() {
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
    out() {
        return `(${this.instr} ${this.args.map(a => a.out()).join(' ')})`;
    }
};

/**
 * Label to enable recursion/jumps
 * TODO replace this with BlockExpr
 */
class LabelExpr extends Expr {
    /**
     * @param {Token} token
     * @param {Expr} target
     */
    constructor(token, target) {
        super(token);
        this.target = target;
        this.origins = [];
    }

    /**
     * @override
     */
    out() {
        return this.target.out();
    }
};

/**
 * Blind jump to label
 * TODO need to distinguish between forward/reverse jumps for wasm
 */
class JumpExpr extends Expr {
    /**
     *
     * @param {Token} token - Source location
     * @param {LabelExpr} target - Where to jump to
     * @param {Expr[]} args - Args for recursive call
     */
    constructor(token, target, args) {
        super(token);
        this.target = target;
        this.args = args;
        target.origins.push(this);
    }

    /**
     * @override
     */
    out() {
        // TODO
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
        this.source.locals[this.position] = this;
    }

    out() {
        return `(local.get ${this.position})`;
    }
};

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

    out() {
        return this.position === 0 ? this.source.out() : "";
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
        this.locals = [];
    }

    out() {
        // TODO tuples
        const outs = this.outputs.map(o => o.out(this));
        return `(func (export "${this.name}") ${
            this.inputTypes.map((t, i) => `(param ${t.value.getBaseType().name})`).join(' ')
        } (result ${this.outputs.map(o => o.datatype.getBaseType().name).join(' ')})\n\t${
            outs.join('\n\t')
        })`;
    }
};


module.exports = {
    Expr,
    DataExpr,
    BranchExpr,
    NumberExpr,
    InstrExpr,
    LabelExpr,
    JumpExpr,
    FunExportExpr,
    ParamExpr,
    ResultExpr,
};