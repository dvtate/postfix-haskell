import { readFileSync } from "fs";

// Import WAST template as a string
import template from "./rt.wat";

// TODO this should be inserted via a preprocessor macro
// const template = readFileSync('./lib/rt.wat').toString();

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

export default function generateRuntime(
    staticData: number[],
    STACK_SIZE: number,
    USER_CODE_STR: string,
    NURSERY_SIZE = 524288,
) {
    const OBJ_HEAD_SIZE = 3 * 4;
    // const EMPTY_HEAD_SIZE = 2 * 4;
    const STATIC_DATA_LEN = staticData.length;
    const STATIC_DATA_STR = staticData.map(byteToHexEsc).join('');
    // const STACK_START = 0;
    const STACK_END = STACK_SIZE;
    const NURSERY_START  = STACK_SIZE;
    const NURSERY_END = STACK_SIZE + NURSERY_SIZE;
    const NURSERY_SP_INIT = NURSERY_END - OBJ_HEAD_SIZE;
    const STATIC_DATA_START = NURSERY_END;
    const STATIC_DATA_END = STATIC_DATA_START + STATIC_DATA_LEN;
    const HEAP_START = STATIC_DATA_END;
    const FREE_START = HEAP_START + OBJ_HEAD_SIZE;
    const PAGES_NEEDED = Math.ceil((FREE_START + 2 + 10) / 65536);
    const INIT_FREE_SIZE = PAGES_NEEDED * 65536 - HEAP_START - OBJ_HEAD_SIZE;
    const INIT_FREE_SIZE_STR = [
        INIT_FREE_SIZE & 0x00_00_00_ff,
        INIT_FREE_SIZE & 0x00_00_ff_00,
        INIT_FREE_SIZE & 0x00_ff_00_00,
        INIT_FREE_SIZE & 0xff_00_00_00,
    ].map(byteToHexEsc).join('');

    const obj = {
        OBJ_HEAD_SIZE, STATIC_DATA_LEN, STATIC_DATA_STR, STACK_END, NURSERY_START,
        NURSERY_END, NURSERY_SP_INIT, STATIC_DATA_START, STATIC_DATA_END, HEAP_START,
        PAGES_NEEDED, INIT_FREE_SIZE, INIT_FREE_SIZE_STR, STACK_SIZE, FREE_START,
        NURSERY_SIZE, USER_CODE_STR,
    };

    return Object.entries(obj).reduce(
        (r, [k, v]) => r.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)),
        template,
    );
}