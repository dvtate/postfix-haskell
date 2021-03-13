const lex = require('../lib/scan');
const parse = require('../lib/parse');
const error = require('../lib/error');
const Context = require('../lib/context');
const wabt = require('wabt');

/**
 *
 * @param {string} src
 * @param {*} importObject
 * @param {*} options
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

module.exports = { compile, phs };