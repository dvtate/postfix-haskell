import type { LexerToken } from "./scan.js";
import type * as value from './value.js';
import type Context from "./context.js";

/**
 * Macro Value that when given an id returns corresponding id in namespace
 */
export default class Namespace {
    constructor(
        public scope: { [k: string]: value.Value },
        public token?: LexerToken,
    ) {
    }

    /**
     * Promote [some] identifiers to the current scope
     * @param ctx context objecr
     * @param token invokee site
     * @param include regex for identifiers to include
     * @param exclude regex for identifiers to exclude
     */
    promote(ctx: Context, token: LexerToken, include?: string, exclude?: string): void {
        // Figure out what to promote
        let toPromote = Object.entries(this.scope);
        if (include !== undefined) {
            const inclRxp = new RegExp(`^${include}$`);
            toPromote = toPromote.filter(([id]) => id.match(inclRxp))
        }
        if (exclude !== undefined) {
            const exclRxp = new RegExp(`^${exclude}$`);
            toPromote = toPromote.filter(([id]) => !id.match(exclRxp));
        }

        // Warn nothing promoted
        if (toPromote.length === 0 ) {
            ctx.warn(token, 'nothing to promote');
            console.warn({ include, exclude, toPromote, obj: this });
            return;
        }

        // Promote each into an unqualified id
        const curScope = ctx.scopes[ctx.scopes.length - 1];
        toPromote.forEach(([id, v]) => {
            // Warn on overwrite
            if (curScope[id] && curScope[id] != v)
                ctx.warn(token, `Overwrote identifier $${id}`);

            // Write to current scope
            curScope[id] = v;
        });
    }

    getId(id: string) {
        return this.scope[id];
    }
}