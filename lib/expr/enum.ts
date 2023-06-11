import * as types from '../datatypes.js';
import * as value from '../value.js';
import * as error from '../error.js';
import type { LexerToken } from '../scan.js';
import type ModuleManager from '../module.js';
import { Expr, DataExpr } from './expr.js';
import type { FunExpr } from './fun.js';
import { constructGc, loadRef } from './gc_util.js';
import { SyntaxError } from '../error.js';
import { DependentLocalExpr, fromDataValue } from './util.js';
import { BranchInputExpr } from './branch.js';
import { uid } from '../util.js';
import Context from '../context.js';

// export class EnumContainsCheckExpr extends DataExpr {
//     _datatype: types.ClassOrType<types.PrimitiveType> = types.PrimitiveType.Types.I32;

//     constructor(token: LexerToken, public enumExpr: DataExpr, public checkType: types.EnumClassType<any>) {
//         super(token, types.PrimitiveType.Types.I32);
//         // TODO typecheck
//     }

//     get datatype(): typeof this._datatype  { return this._datatype; }
//     set datatype(t: typeof this._datatype) { this._datatype = t; }
//     children(): Expr[] { return this.enumExpr.children(); }

//     out(ctx: ModuleManager, fun?: FunExpr) {
//         // Extract type
//         let eedt = this.enumExpr.datatype;
//         if (eedt instanceof types.ClassType)
//             eedt = eedt.getBaseType();

//         // Known at compile-time
//         if (eedt instanceof types.EnumClassType)
//             return `(i32.const ${this.checkType.check(eedt) ? '1' : '0'})`;

//         // Need to determine dynamically
//         if (eedt instanceof types.EnumBaseType)
//             return `${this.enumExpr.out(ctx, fun)
//                 }\n\t(call $__ref_stack_pop)(i32.load)(i32.const ${
//                     this.checkType.index})(i32.eq)`;

//         throw new SyntaxError('Not cannot check if non-enum contains type', [this.enumExpr.token, this.token]);
//     }
// }

export class EnumGetExpr extends DataExpr {
    // declare _datatype: types.RefType<types.DataType>;

    public results?: DependentLocalExpr[];

    private constructor(
        token: LexerToken,
        public enumExpr: value.Value,
        dt: types.EnumClassType<types.DataType>,
    ) {
        super(token, dt.type);
    }

    out(ctx: ModuleManager, fun?: FunExpr) {
        if (!this.results)
            return this.enumExpr.out(ctx, fun)
                + '(drop)'
                + loadRef(new types.RefType(this.token, this._datatype), fun);

        this.results.forEach(r => r.inds = fun.addLocal(r.datatype));
        return `${
            this.enumExpr.out(ctx, fun)
        } (drop) ${
            loadRef(new types.RefType(this.token, this._datatype), fun)
        } ${
            this.results.map(r => fun.setLocalWat(r.inds)).join(' ')
        }`;
    }

    children(): Expr[] {
        return this.enumExpr.children();
    }

    static create(
        token: LexerToken,
        enumExpr: value.Value,
        dt: types.EnumClassType<types.DataType>,
        ctx: Context,
    ): EnumGetExpr | value.TupleValue | error.SyntaxError {
        let retDt = dt.type;
        if (retDt instanceof types.ClassType)
            retDt = retDt.getBaseType();
        if (retDt instanceof types.TupleType) {

            // Shouldn't have to check this
            const badT = retDt.types.find(t => !(t instanceof types.DataType));
            if (badT)
                return new error.SyntaxError('Compile-time only type cannot be used in an enum', [badT.token, token], ctx);

            // Pack Components of loaded value into a tuple
            const ret = new EnumGetExpr(token, enumExpr, dt);
            ret.results = retDt.types.map(t => new DependentLocalExpr(token, t as types.DataType, ret));
            return new value.TupleValue(token, ret.results, dt.type as types.ClassOrType<types.TupleType>);
        }
        return new EnumGetExpr(token, enumExpr, dt);
    }
}

export class EnumTypeIndexExpr extends DataExpr {
    declare _datatype: types.PrimitiveType;

    constructor(token: LexerToken, public enumExpr: value.Value) {
        super(token, types.PrimitiveType.Types.I32);
    }

    children() {
        return this.enumExpr.children();
    }

    out(ctx: ModuleManager, fun?: FunExpr) {
        // let eedt = this.enumExpr.datatype;
        // if (eedt instanceof types.ClassType)
        //     eedt = eedt.getBaseType();
        // // TODO maybe it would make sense to still gen code for enum for side effects?
        // if (eedt instanceof types.EnumClassType)
        //     return `(i32.const ${eedt.index})`;


        // Simply discard the reference
        return this.enumExpr.out(ctx, fun)
        // equiv (call $__ref_stack_pop) (drop)
        + '(global.set $__ref_sp (i32.add (global.get $__ref_sp) (i32.const 4)))'
    }
}

/**
 * Used to construct a gc'd object and reference it via enum
 */
export class EnumConstructor extends DataExpr {
    // outExprs: [value.NumberValue, DependentLocalExpr];
    declare _datatype: types.EnumClassType<types.DataType>;

    constructor(
        token: LexerToken,
        public knownValue: value.Value | DataExpr[],
        private readonly enumClassType: types.EnumClassType<types.DataType>
    ) {
        super(token, enumClassType);
    }

    out(ctx: ModuleManager, fun?: FunExpr): string {
        const v = this.knownValue instanceof value.Value
            ? fromDataValue([this.knownValue])
            : this.knownValue;
        return `(i32.const ${this._datatype.index})\n\t${
                v.map(v => v.out(ctx, fun)).join(' ')
            }\n\t${constructGc(this.enumClassType.type, ctx, fun)}`;
    }

    children(): Expr[] {
        return [];
    }
}


export class EnumMatchExpr extends Expr {

    /**
     * Given results
     */
    results: DependentLocalExpr[];

    inputs: BranchInputExpr[];
    typeIndexExpr: EnumTypeIndexExpr;

    constructor(
        token: LexerToken,
        inputs: (BranchInputExpr | value.Value)[],
        public branches: value.Value[][],
        public branchBindings: number[],
        public outputTypes: types.DataType[],
    ) {
        super(token);
        this.inputs = inputs.filter(v => v instanceof BranchInputExpr) as BranchInputExpr[];
        this.typeIndexExpr = new EnumTypeIndexExpr(token, inputs[inputs.length - 1]);
        this.results = this.outputTypes.map(t => new DependentLocalExpr(token, t, this));
    }

    children() {
        return []
            .concat(...this.branches.map(vs => [].concat(...vs.map(v => v.children()))))
            .concat(...this.inputs.map(inp => inp.children()))
            // .concat(...this.results.map(r => r.children()));
    }

    out(ctx: ModuleManager, fun: FunExpr): string {
        // Prevent multiple compilations
        this._isCompiled = true;

        let ret = this.inputs.map(inp => inp.capture(ctx, fun)).join('\n\t');
        this.results.forEach(r => r.inds = fun.addLocal(r.datatype));

        const retType = this.outputTypes.map(t => t.getWasmTypeName()).join(' ');
        const branchId = `$branch_${uid()}`;
        ret += `(block ${branchId} (result ${retType}) ${
            this.branches.slice(1).map(() => '(block ').join('')
        } (block (block ${
            this.typeIndexExpr.out(ctx, fun)
        }\n\t (br_table ${
            this.branchBindings.map(n => String(n + 1)).join(' ')
        } 0)) unreachable) ${
            this.branches
                .map(vs => vs.map(v => v.out(ctx, fun)).join(' '))
                .join(`(br ${branchId}) )`)
        } )`;
        ret += this.results.map(dl => fun.setLocalWat(dl.inds));

        return ret;
    }
}