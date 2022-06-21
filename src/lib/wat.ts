import * as expr from "./expr";


// Not sure if I'll actually end up using this long term...

/**
 * This way we can easily identify where all the expressions originated from
 */
export class WATCode {
    parts: string[] = [];
    sources: expr.Expr[] = [];

    add(s: string, e: expr.Expr) {
        this.parts.push(s);
        this.sources.push(e);
    }

    concat(other: WATCode) {
        this.parts.push(...other.parts);
        this.sources.push(...other.sources);
    }
}

/**
 * this is a parametric template string literal
 * @param e - expression source
 */
export default function wat(e: expr.Expr) {
    return (strs: string[], ...bindings: WATCode[]): WATCode =>
        strs.reduce((a, s, i) => {
            a.add(s, e);
            if (bindings[i - 1])
                a.concat(bindings[i - 1]);
            return a;
        }, new WATCode());
}


/* Moved to Type.getWasmTypename
export function watTypename(type : types.Type, name: string = ''): string {
    if (type instanceof types.ClassType)
        type = type.getBaseType();

    if (type instanceof types.PrimitiveType)
        return type.name;

    if (type instanceof types.ArrowType)
        return `(func ${name} (param ${
            type.inputTypes.map(t => watTypename(t)).join(' ')
        }) (result ${
            type.outputTypes.map(t => watTypename(t)).join(' ')
        }))`;

    if (type instanceof types.TupleType)
        return type.types.map(t => watTypename(t)).join(' ');

    if (type instanceof types.UnionType)
        throw new Error("cannot make wat typename for union type");

    // For unit type no typename
    return '';
}
*/