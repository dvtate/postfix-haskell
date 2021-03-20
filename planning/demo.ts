import fs = require('fs');

import lex from '../lib/scan';
import parse from '../lib/parse';
import Context from '../lib/context';
import * as error from '../lib/error';
import * as util from '../tools/util';

(async () => {
    // Read program source
    const fname : string = process.argv[2];
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

    // Invoke WASM exports
    const mod = await WebAssembly.instantiate(wasm.buffer, {});
    const sqrt = mod.instance.exports.sqrt as CallableFunction;
    for (let i = 1; i < 10; i++)
        console.log(sqrt(i));
})();