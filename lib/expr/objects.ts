// import * as types from '../datatypes.js';
// import * as value from '../value.js';
// import * as error from '../error.js';
// import { Expr, DataExpr } from './expr.js';
// import type { FunExpr } from './fun.js';
// import { constructGc, loadRef } from './gc_util.js';
// import type ModuleManager from '../module.js';

// /**
//  * Create a tuple object that get stored in the runtime stack
//  */
// export class TupleObjExpr extends DataExpr {
//     declare value: DataExpr[];

//     constructor(token: LexerToken, ctx: Context, v: value.TupleValue) {
//         super(token, v.datatype);
//         this.value = fromDataValue(v.value, ctx);
//     }

//     get expensive(): boolean {
//         return false;
//     }

//     out(ctx: ModuleManager, fun?: FunExpr): string {
        
//         return this.value.map(v => v.out(ctx, fun)).join(' ');
//     }

//     children(): Expr[] {
//         return this.value;
//     }

//     toValue(): value.Value {
//         return new value.TupleValue(this.token, this.value);
//     }
// }
