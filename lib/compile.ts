// Allows Exprs to add helper functions and literals
// Still not sure tho

import * as expr from "./expr";


export default class CompileContext {
    // Module components
    module: string[] = [];

    // Static Data Exports
    staticData: number[] = [];

    constructor(targets : expr.Expr[]) {
        this.module = targets.map(e => e.out(this));
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
        function byteToHexEsc(b : number) {
            const hexChrs = '0123456789abcdef';
            return '\\' + hexChrs[b & (((1 << 4) - 1) << 4)] + hexChrs[b & ((1 << 4) - 1)];
        }

        return `(module\n
            (memory ${Math.floor(this.staticData.length / 64000 + 3)})
            (export "mem" (memory 0))
            ${
                this.module.join('\n\n')
            }
            (data (i32.const 0) "${ // Static data
                this.staticData.map(byteToHexEsc).join('')
            }"))`;
    }

    /**
     *
     * @param s - static string literal
     * @returns - memory address
     */
    addStaticData(d: Array<number> | Uint8Array | Uint16Array | Uint32Array | string): number {
        // Convert into array of bytes
        if (d instanceof Uint32Array)
            d = new Uint8Array(d.reduce((a, c) => [
                ...a,
                c & ((1 << 8) - 1),
                c & ((1 << 16) - 1),
                c & ((1 << 24) - 1),
                (c >> 24) & ((1 << 8) - 1), // Downshift to avoid i32 overflow
            ], []));
        else if (d instanceof Uint16Array)
            d = new Uint8Array(d.reduce((a, c) => [
                ...a,
                c & ((1 << 8) - 1),
                c & ((1 << 16) - 1),
            ], []));
        else if (typeof d === 'string')
            d = new TextEncoder().encode(d); // u8array

        // TODO maybe handle bigints?

        // Check to see if there's a subsection with same value already
        for (let i = 0; i < this.staticData.length; i++) {
            let j;
            for (j = 0; j < d.length; j++)
                if (this.staticData[i + j] !== d[j])
                    break;

            // The data already exists
            if (j == d.length)
                return i;
        }

        // Append to static data
        const ret = this.staticData.length;
        this.staticData.push(...d);
        return ret;
    }
};