import * as types from "./datatypes";
import { watTypename } from "./wat";
import * as expr from './expr';
import CompileContext from "./compile";

/**
 * Manges module imports & exports
 */
export default class ModuleManager {
    // Set of imports
    private imports: {
        [k : string] : {
            // ['js', 'eval']
            scopes: string[];

            // (i32, i32) => (f32)
            type: types.ArrowType;

            // $import_23
            importId: string;
        }
    } = {};

    // Unique identifier number for imports
    private importId: number = 0;

    // Functions to export
    private exports: Array<expr.FunExportExpr> = [];

    constructor() {}

    /**
     *
     * @param s
     * @returns
     */
    private static escapeSpaces(s: string) {
        // TODO in a million years replace this with String.prototype.replaceAll
        return s.split('').map(c => {
            if (c === '\\')
                return '\\\\';
            else if (c === ' ')
                return '\\ ';
            else
                return c;
        }).join('');
    }

    /**
     * Add an import
     * @param scopes - env scopes to import from
     * @param type - type of imported value
     * @returns - identifier to which the import is assigned
     */
    addImport(scopes: string[], type: types.ArrowType): string {
        // const scopesKey = scopes.map(ModuleManager.escapeSpaces).join(' ');
        const scopesKey = scopes.join('\0');
        if (!this.imports[scopesKey])
            this.imports[scopesKey] = {
                scopes,
                type,
                importId: `$import_${this.importId++}`,
            };
        return this.imports[scopesKey].importId;
    }

    /**
     * Export a function
     * @param fn - function to export
     */
    export(fn : expr.FunExportExpr) {
        this.exports.push(fn);
    }

    /**
     * Generate import section of wasm
     * @returns -  webassembly text code
     */
    compile(ctx : CompileContext) {
        // Compile imports
        ctx.module.push(Object.values(this.imports)
            .map(i => `(import ${
                // TODO use String.prototype.replaceAll() in 2 years
                i.scopes.map(s => `"${s.split('').map(c => c === '"' ? '\\"' : c).join('')}"`).join(' ')
            } ${watTypename(i.type, i.importId)})`).join('\n'));

        // Compile exports
        ctx.module.push(...this.exports.map(e => e.out(ctx)));
    }

    /**
     * Make a copy
     */
    clone(): ModuleManager {
        const ret = new ModuleManager();
        ret.imports = { ...this.imports };
        ret.importId = this.importId;
        return ret;
    }
};