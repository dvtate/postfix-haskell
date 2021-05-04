import * as expr from "./expr";
import ModuleManager from "./module_mgr";

// Allows Exprs to add helper functions, literals, etc.


export default class CompileContext {
    // Module components
    module: string[] = [];

    // Static Data Exports
    staticData: number[];

    constructor(module : ModuleManager, staticData : number[]) {
        module.compile(this); // Sets this.module
        this.staticData = staticData;
    }

    /**
     *
     * @returns - Webassembly text
     */
    out() {
        // TODO imports
        // TODO exports
        // TODO globals/stack pointer

        /**
         * Convert a byte into an escaped hex character
         * @param b - byte
         * @returns - string of form \00 where 00 is replaced by hex equiv
         */
        function byteToHexEsc(b : number): string {
            const hexChrs = '0123456789ABCDEF';
            return '\\'
                + hexChrs[(b & (((1 << 4) - 1) << 4)) >> 4]
                + hexChrs[b & ((1 << 4) - 1)];
        }

        return `(module\n
            ${
                this.module.join('\n\n')
            }
            (memory (export "memory") ${
                // Start out with enough pages for static data + 1
                Math.floor(this.staticData.length / 64000 + 1)
            })
            (data (i32.const 0) "${
                // Static data as a hex string
                this.staticData.map(byteToHexEsc).join('')
            }"))`;
    }
};