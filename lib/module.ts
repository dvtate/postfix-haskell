import * as types from "./datatypes";
import * as expr from './expr';

/**
 * Manges module imports & exports
 */
export default class ModuleManager {
    /**
     * Set of imports
     */
    private imports: {
        [k: string]: {
            // ['js', 'eval']
            scopes: string[];

            // (i32, i32) => (f32)
            type: types.ArrowType;

            // $import_23
            importId: string;

            // (func $import_23 (param i32 i32) (result f32))
            typeName: string;
        }[]
    } = {};

    /**
     * Functions to export
     */
    private functions: Array<expr.FunExportExpr> = [];

    /**
     * Static data section of linear memory
     */
    private staticData: number[] = [];

    /**
     * Primarily function exports. Compiled functions and stuff that go in main body of module
     */
    definitions: string[] = [];

    /**
     * Used to generate unique importIds
     */
    private static uid: number = 0;

    /**
     * @param optLevel - optimization level for the compilation
     */
    constructor(public optLevel: number = 1) { }

    /**
     * Add an import
     * @param scopes - env scopes to import from
     * @param type - type of imported value
     * @returns - identifier to which the import is assigned
     */
    addImport(scopes: string[], type: types.ArrowType): string {
        // TODO this assumes that the user doesn't have imports with '\0' characters
        const scopesKey = scopes.join('\0');

        // Imports currently limited to single return
        if (type.outputTypes.length > 1)
            return '';

        // Look to see if we've seen it before
        if (this.imports[scopesKey]) {
            // TODO .getWasmTypeName() is probably expensive and this is O(M*N)
            const match = this.imports[scopesKey].find(imp =>
                imp.typeName == type.getWasmTypeName(imp.importId))
            if (match)
                return match.importId;
        } else {
            this.imports[scopesKey] = [];
        }

        // Has not been seen before
        const importId = `$import_${ModuleManager.uid++}`;
        this.imports[scopesKey].push({
            scopes,
            type,
            importId,
            typeName: type.getWasmTypeName(importId),
        });
        return importId;
    }

    /**
     * Export a function
     * @param fn - function to export
     */
    addFunction(fn: expr.FunExportExpr) {
        this.functions.push(fn);
    }

    /**
     * Generate import section of wasm
     * @returns - WebAssembly text code
     */
    compile(): string {
        // TODO globals/stack pointer

        // Compile exports
        // Some expressions add helper funcitons so we have to compile
        //   until there are no more
        do {
            const exports = this.functions;
            this.functions = [];
            this.definitions.push(...exports.map(e => e.out(this)));
        } while (this.functions.length);

        // Compile imports
        this.definitions.push(Object.values(this.imports)
            .map(is => is.map(i => `(import ${
                    // TODO use String.prototype.replaceAll() in 2 years
                    i.scopes.map(s => `"${s.split('').map(c => c === '"' ? '\\"' : c).join('')}"`).join(' ')
                } ${i.type.getWasmTypeName(i.importId)})`).join('\n')).join('\n\n'));

        // Create module as string
        return `(module
            ${this.definitions.filter(Boolean).join('\n\n')}
            (memory (export "memory") ${this.initialPages()})
            (data (i32.const 0) "${this.staticDataToHexString()}"))`;
    }

    /**
     * Make a copy
     */
    clone(): ModuleManager {
        const ret = new ModuleManager(this.optLevel);
        // Slice exports
        ret.functions = { ...this.functions };

        // These properties are only referenced as we want to keep changes from smaller scopes
        ret.imports = this.imports;
        ret.staticData = this.staticData;
        ret.definitions = this.definitions;
        return ret;
    }

    /**
     * Convert data to byte array
     * @param d data source
     * @returns data as array of bytes
     */
    static toByteArray(d: Array<number> | Uint8Array | Uint16Array | Uint32Array | string | bigint): Uint8Array {
        // No action
        if (d instanceof Uint8Array)
            return d;

        // Encode string to utf-8
        if (typeof d === 'string')
            return new TextEncoder().encode(d);

        // Convert other typed arrays
        if (d instanceof Uint32Array)
            return new Uint8Array(d.reduce((a, c) => [
                ...a,
                c & 0b11111111,
                (c & 0b11111111_00000000) >> 8,
                (c & 0b11111111_00000000_00000000) >> 16,
                (c >> 24) & 0b11111111, // Note: Downshift to avoid i32 overflow
            ], []));
        if (d instanceof Uint16Array)
            return new Uint8Array(d.reduce((a, c) => [
                ...a,
                c & 0b11111111,
                c >> 8,
            ], []));
        if (d instanceof Array)
            return new Uint8Array(d);

        // Convert bigint
        if (typeof d == 'bigint') {
            const ret = [];
            while (d) {
                ret.push(Number(d & 0b11111111n))
                d >>= 8n;
            }
            return new Uint8Array(ret.reverse());
        }
    }

    /**
     * Store static data
     * @param data - data to save statically
     * @returns - memory address
     */
    addStaticData(data: Array<number> | Uint8Array | Uint16Array | Uint32Array | string): number {
        // Convert data to byte array
        const bytes = ModuleManager.toByteArray(data);

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
        function byteToHexEsc(b: number): string {
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