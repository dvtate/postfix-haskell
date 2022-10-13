
/**
 * Generate an wat compatible identifier from a number
 * @param n numeric seed
 * @returns wat-compatible identifier
 */
export function encodeNum(n: number): string {
    const enc = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ~!@#$%^&*_-+=|:.><?/'";
    const base = enc.length;
    let ret = '';
    do {
        ret += enc[n % base];
        n /= base;
    } while (n >= 1);
    return ret;
}

// Used by function uid
let nUid = 0;

/**
 * Genereate a globally unique identifier string
 * @returns unique string identifier
 */
export function uid(): string {
    return encodeNum(nUid++);
}