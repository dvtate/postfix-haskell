import { readFileSync } from "fs";

// TODO this should be inserted via a preprocessor macro
const template = readFileSync('rt.wat').toString();

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
    NURSERY_SIZE = 524288,
) {
    const STATIC_DATA_LEN = staticData.length;
    const STATIC_DATA_STR = staticData.map(byteToHexEsc).join('');
    const STACK_START = 0;
    const STACK_END = STACK_SIZE;
    const NURSERY_START  = STACK_SIZE;
    const NURSERY_END = STACK_SIZE + NURSERY_SIZE;


    // TODO do calculations here
}