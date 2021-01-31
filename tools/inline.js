const lex = require('../lib/scan');
const parse = require('../lib/parse');
const error = require('../lib/error');
const Context = require('../lib/context');
const wabt = require('wabt');

async function compile(src, importObject = {}, options = {}) {
    const ctx = parse(lex.parse(src, "inline"));
    if (!(ctx instanceof Context))
        throw ctx;
    const wasm = await ctx.outWasm({});
    const valid = WebAssembly.validate(wasm.buffer);
    return await WebAssembly.instantiate(wasm.buffer, importObject);
}


// Tagged template string literal
async function phs(src, bindings) {
    // TODO handle import bindings
    return await compile(src.join(''));
}

module.exports = {compile, phs };