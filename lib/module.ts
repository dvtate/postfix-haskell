import Context from "./context.js";
import * as types from "./datatypes.js";
import * as expr from './expr/index.js';
import * as error from './error.js';

// Import WAST template as a string
import template, { noRuntime as noRuntimeTemplate } from "./rt.wat.js";

// class StaticMemoryRegion {
//     isConst: boolean;
//     startAddress: number;
//     length: number;
//     initializedData: Uint8Array = null;

//     constructor() {

//     }
// }

// class StaticMemory {
//     constructor() {}

// }


/**
 * Convert a byte into an escaped hex character
 * @param b - byte
 * @returns - string of form \XX where XX is replaced by character hex equiv
 */
function byteToHexEsc(b: number): string {
    const hexChrs = '0123456789ABCDEF';
    return '\\'
        + hexChrs[(b & 0xf0) >> 4]
        + hexChrs[b & 0xf];
}

/**
 * Adjust compiler behavior
 */
 export interface CompilerOptions {
    /**
     * How aggressively should this program be optimized? (default: 1)
     */
    optLevel?: number,

    /**
     * How many bytes should be reserved for the nursery (default: 524288)
     */
    nurserySize?: number,

    /**
     * How many bytes should be reserved for the stack (default: 1024000)
     */
    stackSize?: number,

    /**
     * Should we not include the normal runtime boilerplate in the output wat?
     *
     * Program unlikely to run but useful for debugging
     */
    noRuntime?: boolean,

}

/**
 * Manage relevant components of WASM module, needed for compilation
 *
 * Note: Could rename to Compiler but too abstract
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
     * Indicates if data is const or user modifiyable
     */
    private staticDataConst: boolean[] = [];

    /**
     * Primarily function exports. Compiled functions and stuff that go in main body of module
     */
    definitions: string[] = [];

    /**
     * Used to generate unique importIds
     */
    private static uid = 0;

    /**
     * Optimization level for compilation (0-3)
     */
    public optLevel: number;

    /**
     * Size in bytes of the references stack section of linear memory
     * (see planning/implementation/lm.md)
     */
    protected stackSize: number;

    /**
     * Size in bytes of the nursery section of linear memory
     * (see planning/implementation/lm.md)
     */
    protected nurserySize: number;

    /**
     * Function ids to be added to the table
     */
    protected tableElems: string[] = [];

    /**
     * Don't include normal runtime boilerplate
     */
    protected noRuntime: boolean;

    /**
     * @param ctx - parser context object
     * @param opts - compilation options
     */
    constructor(
        public ctx?: Context,
        opts: CompilerOptions = {},
    ) {
        this.optLevel = opts.optLevel || (ctx ? ctx.optLevel : 1);
        this.stackSize = opts.stackSize || 1024000;
        this.nurserySize = opts.nurserySize || 524288;
        this.noRuntime = !!opts.noRuntime;
    }

    /**
     * Add an import
     * @param scopes - env scopes to import from
     * @param type - type of imported value
     * @returns - identifier to which the import is assigned
     */
    addImport(scopes: string[], type: types.ArrowType): string | error.SyntaxError {
        // TODO this assumes that the user doesn't have imports with '\0' characters
        const scopesKey = scopes.join('\0');

        // Return types must be specified
        if (!type.outputTypes)
            return new error.SyntaxError('Cannot add import with partial arrow type', [type.token], this.ctx);
        // Imports currently limited to single return
        // TODO this shouldn't be the case
        if (type.outputTypes.filter(t => t instanceof types.DataType && !t.isUnit()).length > 1)
            return new error.SyntaxError('Imports restricted to single return', [type.token], this.ctx);

        // Look to see if we've seen it before
        if (this.imports[scopesKey]) {
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
     * Track helper necessary functions generated
     */
    definedHelpers: Set<string>;

    /**
     * Define a helper/utility function that we don't really care about
     * If it's already been defined return early
     * @param helperId identifier for the helper function
     * @depricated should just generate helper manually. Currently unused.
     */
    addHelper(helperId: string): void {
        if (this.definedHelpers.has(helperId))
            return;

        // Helper to swap 2 values on the stack
        // Note this has bad performance
        if (helperId.startsWith('__swap_')) {
            const [t1, t2] = helperId.slice(7).split('_');
            this.definitions.push(`(func $${helperId
                } (param ${t1} ${t2}) (result ${t2} ${t1
                }) (local.get 1) (local.get 0))`);
            this.definedHelpers.add(helperId);
            return;
        }

        throw new Error('invalid helper: ' + helperId);
    }

    /**
     * Export a function
     * @param fn - function to export
     */
    addFunction(fn: expr.FunExpr) {
        this.functions.push(fn);
        fn.module = this;
    }

    /**
     * Generate import section of wasm
     * @returns - WebAssembly text code
     */
    compile(): string {
        // Compile exports
        // Some expressions add helper funcitons so we have to compile
        //   until there are no more
        do {
            const exports = this.functions;
            this.functions = [];
            this.definitions.push(...exports.map(e => e.out(this)));
        } while (this.functions.length);

        // Compile imports
        const importDefs = Object.values(this.imports)
            .map(is => is.map(i => `(import ${
                    i.scopes.map(s => `"${s.replaceAll('"', '\\"')}"`).join(' ')
                    // i.scopes.map(s => `"${s.split('').map(c => c === '"' ? '\\"' : c).join('')}"`).join(' ')
                } ${
                    i.type.getWasmTypeName(i.importId)
                })`)
                .join('\n')
            ).join('\n\n');

        // Insert user-generated code into our runtime
        return this.generateRuntime(
            importDefs,
            this.definitions.filter(Boolean).join('\n\n'),
        );
    }

    /**
     * Make a copy
     */
    clone(): ModuleManager {
        // Make new module
        const ret = new ModuleManager(this.ctx, {
            optLevel: this.optLevel,
            stackSize: this.stackSize,
            nurserySize: this.nurserySize,
        });

        // Shallow-Copy exports
        ret.functions = { ...this.functions };

        // These properties are only referenced as we want to keep changes from smaller scopes
        ret.imports = this.imports;
        ret.staticData = this.staticData;
        ret.staticDataConst = this.staticDataConst;
        ret.definitions = this.definitions;
        return ret;
    }

    /**
     * Convert data to byte array
     * @param d data source
     * @returns data as array of bytes
     */
    static toByteArray(d: Array<number> | Uint8Array | Uint16Array | Uint32Array | string): Uint8Array {
        // No action
        if (d instanceof Uint8Array)
            return d;

        // Encode string to utf-8
        if (typeof d === 'string')
            return new TextEncoder().encode(d); // UTF-8

        // Convert other typed arrays
        if (d instanceof Uint32Array || d instanceof Uint16Array)
            return new Uint8Array(d.buffer);

        // Non-typed assumed to already be uint8's
        if (d instanceof Array)
            return new Uint8Array(d);

        // Convert bigint
        // if (typeof d == 'bigint') {
        //     const ret = [];
        //     while (d) {
        //         ret.push(Number(d & 0b11111111n))
        //         d >>= 8n;
        //     }
        //     return new Uint8Array(ret.reverse());
        // }
    }

    /**
     * Store static data
     * @param data - data to save statically
     * @param isConst - if true we can check to see if it's already in data section and simply point to it
     * @returns - memory address for start of region
     */
    addStaticData(data: Array<number> | Uint8Array | Uint16Array | Uint32Array | string, isConst = false): number {
        // TODO OPTIMIZATION we should segregate strings vs non-string static data (also const vs non-const)
        // TODO OPTIMIZATION there are often large segements of memory which are never initialized
        //                   probably better to have an Array of sparse StaticMemoryRegions to make compilation faster

        // Convert data to byte array
        const bytes = ModuleManager.toByteArray(data);

        // Check to see if same value already exists
        if (isConst && this.optLevel >= 2)
            for (let i = 0; i < this.staticData.length; i++) {
                let j = 0;
                for (; j < bytes.length; j++)
                    if (this.staticData[i + j] !== bytes[j] || !this.staticDataConst[i + j])
                        break;

                // The data already exists
                if (j == bytes.length)
                    return i + (this.noRuntime ? 0 : this.stackSize);
            }

        // Append to static data
        // Due to logic in .clone() we cannot make copies
        const ret = this.staticData.length + (this.noRuntime ? 0 : this.stackSize);
        bytes.forEach(b => this.staticData.push(b)); // can't use .push(...bytes) because of max stack size error
        for (let i = 0; i < bytes.length; i++)
            this.staticDataConst.push(isConst);
        return ret;
    }

    /**
     * Initialize static data to a specific value
     * @param address address of static data to set
     * @param value value to set static data to
     */
    setStaticData(address: number, value: number) {
        this.staticData[address - (this.noRuntime ? 0 : this.stackSize)] = value;
    }


    /**
     * Determine the amount of memory to use
     * @returns - number of pages to start with
     */
    initialPages(): number {
        // Start out with enough pages for static data + 1
        return Math.floor(this.staticData.length / 64000 + 1);
    }

    /**
     * Add a function to the table
     * @param fnName identifier for function to push into the table
     * @returns index of the function
     */
    addToTable(fnName: string): number {
        return this.tableElems.push(fnName) - 1;
    }

    /**
     * Generate code for the table section of the the runtime
     * @returns wat code for the table section
     */
    genTable(): string {
        return `(table (export "__table") ${this.tableElems.length} funcref ${
            this.tableElems.length
                ? `(elem ${this.tableElems.map(id => '$' + id).join(' ')})`
                : ''
        })`;
    }

    /**
     * Generate a wasm module from a template which includes our runtime
     * @param USER_CODE_STR user's function definitions and exports
     * @param STACK_SIZE size of the references stack
     * @param NURSERY_SIZE
     * @returns wasm module text
     * @remark see planning/implementation/lm.md for more on memory layout
     */
    generateRuntime(
        USER_IMPORTS: string,
        USER_CODE_STR: string,
        STACK_SIZE: number = this.stackSize,
        NURSERY_SIZE: number = this.nurserySize,
    ): string {
        // Constants
        const OBJ_HEAD_SIZE = 3 * 4;
        // const EMPTY_HEAD_SIZE = 2 * 4;
        // Align to 4 bytes if non-zero
        const STATIC_DATA_LEN = this.staticData.length
            && (this.staticData.length | 0b11) + 1;

        // TODO is linear memory by default zero-initialized?
        //  if so we can do a sparse version of this instead
        const STATIC_DATA_STR = this.staticData.map(byteToHexEsc).join('');
        // const STACK_START = 0;
        const STACK_END = STACK_SIZE;
        const RV_STACK_END = STACK_END / 2; // TODO see planning/brainstorm/ref_stack_vars.md about removing this stack
        const NURSERY_START = STACK_SIZE + STATIC_DATA_LEN;
        const NURSERY_END = STACK_SIZE + NURSERY_SIZE;
        const NURSERY_SP_INIT = NURSERY_END - OBJ_HEAD_SIZE;
        const STATIC_DATA_START = this.noRuntime ? 0 : NURSERY_END;
        const STATIC_DATA_END = STATIC_DATA_START + STATIC_DATA_LEN;
        const HEAP_START = STATIC_DATA_END;
        const FREE_START = HEAP_START + OBJ_HEAD_SIZE;
        const PAGES_NEEDED = this.noRuntime
            ? Math.ceil(STATIC_DATA_LEN / 65536)
            : Math.ceil((FREE_START + 2 + 10) / 65536);
        const INIT_FREE_SIZE = (PAGES_NEEDED * 65536 - HEAP_START - OBJ_HEAD_SIZE) >> 2; // in multiples of i32's
        const USER_TABLE = this.genTable();

        // Little-endian hex-string representation
        const INIT_FREE_SIZE_STR = [
            INIT_FREE_SIZE & 0xff,
            (INIT_FREE_SIZE >> 8) & 0xff,
            (INIT_FREE_SIZE >> 16) & 0xff,
            (INIT_FREE_SIZE >> 24) & 0xff,
        ].map(byteToHexEsc).join('');

        const obj = {
            OBJ_HEAD_SIZE, STATIC_DATA_LEN, STACK_END, NURSERY_START,
            NURSERY_END, NURSERY_SP_INIT, STATIC_DATA_START, STATIC_DATA_END, HEAP_START,
            PAGES_NEEDED, INIT_FREE_SIZE, INIT_FREE_SIZE_STR, STACK_SIZE, FREE_START,
            USER_TABLE, NURSERY_SIZE, USER_CODE_STR, USER_IMPORTS, STATIC_DATA_STR,
            RV_STACK_END,
        };

        return Object.entries(obj).reduce(
            (r, [k, v]) => r.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)),
            this.noRuntime ? noRuntimeTemplate : template,
        );
    }
}