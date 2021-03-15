const lex = require('../lib/scan');
const parse = require('../lib/parse');
const error = require('../lib/error');
const util = require('../tools/util');
const Context = require('../lib/context');
const fs = require('fs');

(async () => {
    // Read program source
    const fname = process.argv[2];
    const src = fs.readFileSync(fname).toString();

    // Compile program
    const ctx = parse(lex(src, fname));
    if (ctx instanceof error.SyntaxError)
        console.log(util.formatErrorPos([ctx]));
    if (!(ctx instanceof Context))
        throw ctx;

    // Generate WASM and check validity
    const wasm = await ctx.outWasm();
    const valid = WebAssembly.validate(wasm.buffer);
    if (!valid)
        throw new Error("WebAssembly.validate() failed");

    // Create WASM instance
    const mod = await WebAssembly.instantiate(wasm.buffer, {});

    // Invoke WASM Functions
    const {sqrt} = mod.instance.exports;
    console.log(sqrt(1));
    console.log(sqrt(2));
    console.log(sqrt(3));
    console.log(sqrt(4));
    console.log(sqrt(5));
    console.log(sqrt(6));
    console.log(sqrt(7));
    console.log(sqrt(8));
    console.log(sqrt(9));
    console.log(sqrt(10));

})();