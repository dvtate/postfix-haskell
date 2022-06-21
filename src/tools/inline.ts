import lex from "../lib/scan";
import parse from "../lib/parse";
import Context from "../lib/context";

// Import wabt promise
import wabtMod from "wabt";
const wabtProm = wabtMod();

/**
 * Compile source code and instantiate module
 * @param src source code
 * @param importObject bindings imported from js
 */
export async function compile(src: string, importObject = {}) {
    // TODO bindings
    const ctx = parse(lex(src, "inline"));
    if (!(ctx instanceof Context))
        throw ctx;
    const wasm = await ctx.outWasm();
    const valid = WebAssembly.validate(wasm.buffer);
    if (!valid)
        throw new Error("WebAssembly.validate() failed");
    return await WebAssembly.instantiate(wasm.buffer, importObject);
}

// Tagged template string literal
/**
 *
 * @param {string[]} src - phs source code
 * @param {Array} bindings - js entities to be included in the module
 */
export async function phs(src: TemplateStringsArray, ...bindings: string[]) {
    return await compile(
        src.reduce((acc: string, part: string, i: number) => `${acc} "phs_js_bind ${i}" ${part}`),
        bindings.reduce((acc, v, i) => ({ ...acc, [`phs_js_bind ${i}`]: v }), {}),
    );
}

/*
Bindings: in this example it prompts user at compile time for this
const m = await phs`
    {${Number(prompt('enter a number'))} 10 + } $f =
    Unit { f } $plus10 export
`;
*/

/**
 * @param {string} src - webasseembly text form source
 * @param {*} importObject
 * @returns {WebAssembly.Instance}
 */
export async function compileWat(src: string, importObject = {}) {
    const wabt = await wabtProm;
    const mod = wabt.parseWat("inline", src, {
        exceptions: true,
        mutable_globals: true,
        sat_float_to_int: true,
        sign_extension: true,
        simd: true,
        threads: true,
        multi_value: true,
        tail_call: true,
        bulk_memory: true,
        reference_types: true,
        annotations: true,
        gc: true,
    });

    // Validate
    mod.validate();

    const bin = mod.toBinary({ log: true });
    const valid = WebAssembly.validate(bin.buffer);
    if (!valid)
        return console.error("wasm invalid!", valid);

    return await WebAssembly.instantiate(bin.buffer, importObject);
}