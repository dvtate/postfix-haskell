const lex = require('../lib/scan');
const parse = require('../lib/parse');
const error = require('../lib/error');
const Context = require('../lib/context');
const wabtProm = require('wabt')();

/**
 *
 * @param {string} src
 * @param {*} importObject
 * @param {*} options
 * @returns {WebAssembly.Instance}
 */
async function compile(src, importObject = {}, options = {}) {
    // TODO bindings
    const ctx = parse(lex.parse(src, "inline"));
    if (!(ctx instanceof Context))
        throw ctx;
    const wasm = await ctx.outWasm({});
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
async function phs(src, ...bindings) {
    return await compile(
        src.reduce((acc, part, i) => `${acc} "phs_js_bind ${i}" ${part}`),
        bindings.reduce((acc, v, i) => ({ ...acc, [`phs_js_bind ${i}`]: v }), {}),
    );
}

/*
Bindings: in this example it prompts user at compile time for this
const m = await phs`
    {${Number(prompt('enter a number'))} 10 + } $f =
    {} { f } $plus10 target
`;
*/

/**
 * @param {string} src - webasseembly text form source
 * @param {*} importObject
 * @returns {WebAssembly.Instance}
 */
async function compileWat(src, importObject = {}) {
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
    const invalid = mod.validate();
    if (invalid)
        return console.error(invalid);

    const bin = mod.toBinary({log: true});
    const valid = WebAssembly.validate(bin.buffer);
    if (!valid)
        return console.error("wasm invalid!", valid);

    return await WebAssembly.instantiate(bin.buffer, importObject);
}

module.exports = { compile, phs, compileWat };