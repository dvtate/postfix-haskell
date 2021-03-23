import * as expr from './expr';

// Not sure if I'll actually end up using this long term...

/**
 * This way we can easily identify where all the expressions originated from
 */
export class WATCode {
    parts: string[] = [];
    sources: expr.Expr[] = [];

    constructor(){}

    add(s: string, e: expr.Expr) {
        this.parts.push(s);
        this.sources.push(e);
    }

    concat(other: WATCode) {
        this.parts.push(...other.parts);
        this.sources.push(...other.sources);
    }
};

type TaggedTemplateLiteral = (strs: string[], ...bindings: WATCode[]) => WATCode;

export default function wat(e: expr.Expr): TaggedTemplateLiteral {
    return (strs: string[], ...bindings: WATCode[]): WATCode =>
        strs.reduce((a, s, i) => {
            a.add(s, e);
            if (bindings[i - 1])
                a.concat(bindings[i - 1]);
            return a;
        }, new WATCode());
}