import * as types from '../datatypes.js';
import * as value from '../value.js';
import type { LexerToken } from '../scan.js';
import type ModuleManager from '../module.js';
import { Expr, DataExpr } from './expr.js';
import type { FunExpr } from './fun.js';
import { constructGc, loadRef } from './gc_util.js';
import { SyntaxError } from '../error.js';
import { fromDataValue } from './util.js';

export class EnumContainsCheckExpr extends DataExpr {
    _datatype: types.ClassOrType<types.PrimitiveType> = types.PrimitiveType.Types.I32;

    constructor(token: LexerToken, public enumExpr: DataExpr, public checkType: types.EnumClassType<any>) {
        super(token, types.PrimitiveType.Types.I32);
        // TODO typecheck
    }

    get datatype(): typeof this._datatype  { return this._datatype; }
    set datatype(t: typeof this._datatype) { this._datatype = t; }
    children(): Expr[] { return this.enumExpr.children(); }

    out(ctx: ModuleManager, fun?: FunExpr) {
        // Extract type
        let eedt = this.enumExpr.datatype;
        if (eedt instanceof types.ClassType)
            eedt = eedt.getBaseType();

        // Known at compile-time
        if (eedt instanceof types.EnumClassType)
            return `(i32.const ${this.checkType.check(eedt) ? '1' : '0'})`;

        // Need to determine dynamically
        if (eedt instanceof types.EnumBaseType)
            return `${this.enumExpr.out(ctx, fun)
                }\n\t(call $__ref_stack_pop)(i32.load)(i32.const ${
                    this.checkType.index})(i32.eq)`;

        throw new SyntaxError('Not cannot check if non-enum contains type', [this.enumExpr.token, this.token]);
    }
}

export class EnumGetExpr extends DataExpr {
    declare _datatype: types.RefType<types.DataType>;

    constructor(
        token: LexerToken,
        public enumExpr: UnknownEnumExpr | EnumConstructor,
        dt: types.EnumClassType<types.DataType>
    ) {
        super(token, dt.type);
    }

    out(ctx: ModuleManager, fun?: FunExpr) {
        return this.enumExpr.out(ctx, fun)
            + '(drop)'
            + loadRef(new types.RefType(this.token, this._datatype.type), fun);
    }

    children(): Expr[] { return this.enumExpr.children(); }
}

export class UnknownEnumExpr extends DataExpr {

    constructor(token: LexerToken, public source: DataExpr, dt: types.EnumBaseType) {
        super(token, dt);
    }

    out(ctx: ModuleManager, fun?: FunExpr): string {
        return 'todo';
    }

    children(): Expr[] {
        return this.source.children();
    }

    // containsType(t: number | types.EnumClassType<types.DataType>): EnumContainsCheckExpr {

    // }

    // getType(t: number | types.EnumClassType<types.DataType>): EnumGetExpr {}

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
        datatype: types.EnumClassType<types.DataType>
    ) {
        super(token, datatype);
    }

    out(ctx: ModuleManager, fun?: FunExpr): string {
        const v = this.knownValue instanceof value.Value
            ? fromDataValue([this.knownValue])
            : this.knownValue;
        return `\n\t${v.map(v => v.out(ctx, fun)).join(' ')
            }\n\t${constructGc(this.datatype, ctx, fun)
            }(i32.const ${this._datatype.index})`;
    }

    children(): Expr[] {
        return [];
    }

    // containsType(t: number | types.EnumClassType<types.DataType>): value.NumberValue {

    // }
}


// export class EnumMatch extends Expr {

//     results: DependentLocalExpr[];

//     constructor(token: LexerToken, public branches) {
//         super(token);
//     }
// }