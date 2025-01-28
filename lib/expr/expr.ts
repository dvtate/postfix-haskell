import * as value from '../value.js';
import * as types from '../datatypes.js';
import type { LexerToken } from '../scan.js';
import type ModuleManager from '../module.js';
import type { FunExpr, FunLocalTracker } from './func.js';
import * as error from '../error.js';

// This file defines the abstract base types for expressions

// TODO expr constructors should be augmented to also take in Context object
// This way they can also emit warnings

/**
 * Some values are compatible
 */
export interface Compileable {
    out(ctx: ModuleManager, fun?: FunExpr): string;
    children(): Expr[];
    datatype?: types.DataType;
}

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
    _isCompiled = false;

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
     * @param ctx - compilation context
     * @param fun - function export context
     * @returns - wasm translation
     */
    abstract out(ctx: ModuleManager, fun?: FunExpr): string;

    /**
     * Get all expressions which constitute this one
     * @returns child nodes
     * @virtual
     * @deprecated instead should use inputExprs and outputExprs
     */
    abstract children(): Expr[];

    /**
     * Would it be better to store the value in a local or inline it multiple times?
     * @returns true if performance would improve with caching false if inlining better
     * @virtual
     */
    get expensive() {
        return true;
    }

    /**
     * Exhaustive version of .children()
     * @returns all child nodes which don't have children
     * @deprecated
     */
    getLeaves(): Expr[] {
        let ret: Set<Expr> = new Set(this.children());
        let retLen = ret.size;
        do {
            retLen = ret.size;
            // console.log('v', retLen, [...ret][2]);
            ret = [...ret]
                .map(e => {
                    const ret = e.children();
                    return (!ret || ret.length === 0) ? e : ret;
                }).reduce((a, v) => {
                    if (v instanceof Array) {
                        v.forEach(e => a.add(e));
                    } else {
                        a.add(v);
                    }
                    return a;
                }, new Set<Expr>());
        } while (retLen != ret.size);

        return [...ret];
    }

    /* Replacing .children() + .getLeaves()
     * Things we need
     * - all locals that need to be captured for an expression
     * - `fun`'s: locals set in conditions + actions
     * - 
     */

    // /**
    //  * Expressions that this expression takes as inputs
    //  */
    // abstract inputs(): Expr[];

    // /**
    //  * Expressions that this expression gives as output
    //  */
    // abstract outputs(): Expr[];

    // /**
    //  * Expressions used in the body of this expression
    //  */
    // abstract bodyExprs(): Expr[];

    // /**
    //  * Locals used by this expression
    //  */
    // abstract getLocals(): FunLocalTracker[];

}

/**
 * Data Expressions
 * @abstract
 * @class
 */
export abstract class DataExpr extends Expr {
    /**
     * @param token - location in code
     * @param _datatype - Datatype for value
     */
    constructor(token: LexerToken, protected _datatype: types.DataType) {
        super(token);
    }

    /**
     * @override
     */
    get expensive(): boolean {
        return true;
    }

    /**
     * @override
     */
    get datatype(): types.DataType {
        return this._datatype;
    }

    /**
     * @override
     */
    set datatype(t: typeof this._datatype) {
        this._datatype = t;
    }

}
