import * as types from "./datatypes";
import * as expr from './expr';

/**
 * Manges module imports & exports
 */
export default class ModuleManager {
    /// Set of imports
    private imports: {
        [k : string] : {
            // ['js', 'eval']
            scopes: string[];

            // (i32, i32) => (f32)
            type: types.ArrowType;

            // $import_23
            importId: string;

            // (func $import_23 (param i32 i32) (result f32))
            typeName: string;
        }
    } = {};

    /// Functions to export
    private exports: Array<expr.FunExportExpr> = [];

    /// Static data section of linear memory
    private staticData: number[] = [];

    /// Primarily function exports. Compiled functions and stuff that go in main body of module
    definitions: string[] = [];

    /**
     * @constructor
     * @param optLevel - optimization level for the compilation
     */
    constructor(public optLevel: number = 1) {}

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

        // Imports currently limited to single return
        if (type.outputTypes.length > 1)
            return '';

        // Haven't seen this import yet or it's a polymorphic import
        if (!this.imports[scopesKey] || type.getWasmTypeName(this.imports[scopesKey].importId) !== this.imports[scopesKey].typeName) {
            // Add to imports list
            const importId = `$import_${Object.keys(this.imports).length}`;
            this.imports[scopesKey] = {
                scopes,
                type,
                importId,
                typeName: type.getWasmTypeName(importId),
            };
        }

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
    compile() {
        // TODO imports
        // TODO exports
        // TODO globals/stack pointer

        // Compile imports
        this.definitions.push(Object.values(this.imports)
            .map(i => `(import ${
                // TODO use String.prototype.replaceAll() in 2 years
                i.scopes.map(s => `"${s.split('').map(c => c === '"' ? '\\"' : c).join('')}"`).join(' ')
            } ${i.type.getWasmTypeName(i.importId)})`).join('\n'));

        // Compile exports
        this.definitions.push(...this.exports.map(e => e.out(this)));

        return `(module\n
            ${this.definitions.join('\n\n')}
            (memory (export "memory") ${this.initialPages()})
            (data (i32.const 0) "${
                this.staticDataToHexString()
            }"))`;
    }

    /**
     * Make a copy
     */
    clone(): ModuleManager {
        const ret = new ModuleManager(this.optLevel);
        // Slice exports
        ret.exports = { ...this.exports };


        ret.imports = this.imports;
        ret.staticData = this.staticData;
        ret.definitions = this.definitions;

        return ret;
    }

    /**
     * Store static data
     * @param d - data to save statically
     * @returns - memory address
     */
    addStaticData(d: Array<number> | Uint8Array | Uint16Array | Uint32Array | string): number {
        let bytes : Uint8Array;

        // Convert into array of bytes
        if (d instanceof Uint32Array)
            bytes = new Uint8Array(d.reduce((a, c) => [
                ...a,
                c & 0b11111111,
                (c & 0b11111111_00000000) >> 8,
                (c & 0b11111111_00000000_00000000) >> 16,
                (c >> 24) & 0b11111111, // Note: Downshift to avoid i32 overflow
            ], []));
        else if (d instanceof Uint16Array)
            bytes = new Uint8Array(d.reduce((a, c) => [
                ...a,
                c & 0b11111111,
                c >> 8,
            ], []));
        else if (typeof d === 'string')
            bytes = new TextEncoder().encode(d); // u8array
        else if (d instanceof Uint8Array)
            bytes = d;
        else if (d instanceof Array)
            bytes = new Uint8Array(d);

        // TODO maybe handle bigints?

        // Check to see if same value already exists
        if (this.optLevel >= 1)
            for (let i = 0; i < this.staticData.length; i++) {
                let j = 0;
                for (; j < bytes.length; j++)
                    if (this.staticData[i + j] !== bytes[j])
                        break;

                // The data already exists
                if (j == bytes.length)
                    return i;
            }

        // Append to static data
        const ret = this.staticData.length;
        this.staticData.push(...bytes);
        return ret;
    }

    /**
     * Generates a hexstring that initializes the start of linear memory
     * @returns
     */
    staticDataToHexString(): string {
        /**
         * Convert a byte into an escaped hex character
         * @param b - byte
         * @returns - string of form \XX where XX is replaced by character hex equiv
         */
         function byteToHexEsc(b : number): string {
            const hexChrs = '0123456789ABCDEF';
            return '\\'
                + hexChrs[(b & (((1 << 4) - 1) << 4)) >> 4]
                + hexChrs[b & ((1 << 4) - 1)];
        }

        // Static data as a hex string
        return this.staticData.map(byteToHexEsc).join('');
    }

    /**
     * Determine the amount of memory to use
     * @returns - number of pages to start with
     */
    initialPages(): number {
        // Start out with enough pages for static data + 1
        return Math.floor(this.staticData.length / 64000 + 1);
    }
};