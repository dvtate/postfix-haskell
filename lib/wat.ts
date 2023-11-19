
import * as expr from './expr/index.js';
import type * as value from './value.js'

// Not sure if I'll ever actually end up using this...


class SourceOrigin {
    code: string;
    source: expr.Expr | value.Value;
}


/**
 * This way we can easily identify where all the expressions originated from
 */
export class WatCode {
    /**
     * WAT source code
     */
    protected parts: string[] = [];

    /**
     * Expressions where this source code is defined
     */
    protected sources: Array<expr.Expr | value.Value> = [];

    /**
     * Hierarchical construction of code
     */
    protected nested: Array<SourceOrigin | WatCode> = [];

    /**
     * @param e expression
     * @param strs strings for expression
     */
    constructor(e?: expr.Expr | value.Value, ...strs: string[]) {
        if (e && strs.length !== 0) {
            this.parts = strs;
            this.sources = strs.map(_ => e);
        }
    }

    /**
     * Add new snippet
     * @param s source code
     * @param e source expression
     */
    add(e: expr.Expr | value.Value, s: string) {
        this.sources.push(e);
        this.parts.push(s);
        return this;
    }

    concat(...others: WatCode[]): this {
        others.forEach(other => {
            this.parts.push(...other.parts);
            this.sources.push(...other.sources);
        });
        return this;
    }

    toString() {
        return this.parts.join('');
    }


    debug(startLine?:number, endLine?: number) {
        let i = 0, lineNum = 0;

        // console.log(this.parts.length, this.parts.map(p => p.length));

        if (startLine !== undefined) {
            let pln = lineNum;
            for (; i < this.parts.length && lineNum < startLine; i++) {
                pln = lineNum;
                for (let c = 0; c < this.parts[i].length; c++)
                    if (this.parts[i][c] === '\n') {
                        lineNum++;
                    }
            }
            lineNum = pln;
        }
        

        if (startLine === undefined)
            for (; i < this.parts.length; i++)
                    console.log(this.parts[i].length > 30 ? this.parts[i].slice(0, 25) + '...' : this.parts[i], '\t\t', this.sources[i].constructor);
        else {
            endLine = endLine || (startLine + 1);
            for (; i < this.parts.length; i++) {
                console.log(this.parts[i].length > 30 ? this.parts[i].slice(0, 25) + '...' : this.parts[i], '\t\t', this.sources[i].constructor);
                for (let c = 0; c < this.parts[i].length; c++)
                    if (this.parts[i][c] === '\n') {
                        lineNum++;
                        console.log('line');
                    }
                if (lineNum > endLine)
                    break;
            }
        }
    }
}

/**
 * this is a parametric template string literal
 * @param e - expression source
 */
export default function wat(e: expr.Expr | value.Value) {
    return (strs: TemplateStringsArray, ...bindings: Array<WatCode | string | WatCode[]>): WatCode =>
        strs.reduce((a, s, i) => {
            function addItem(item: WatCode | string | WatCode[]) {
                if (item) {
                    if (typeof item === 'string')
                        a.add(e, item as string);
                    else if (item instanceof Array)
                        item.forEach(addItem)
                    else
                        a.concat(item as WatCode);
                }
            }

            addItem(s);
            addItem(bindings[i]);
            return a;
        }, new WatCode());
}

wat.join = function (
    e: expr.Expr | value.Value,
    s: string,
    ...exprs: Array<WatCode | string | WatCode[]>
): WatCode {
    const ret = new WatCode();

    function addItem(item: WatCode | string | WatCode[]) {
        if (item) {
            if (typeof item === 'string')
                ret.add(e, item as string);
            else if (item instanceof Array)
                item.forEach(addItem)
            else
                ret.concat(item as WatCode);
        }
    }

    // Join algo
    addItem(exprs[0]);
    for (let i = 1; i < exprs.length; i++) {
        addItem(s);
        addItem(exprs[i]);
    }

    return ret;
};