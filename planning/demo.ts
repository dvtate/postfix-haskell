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

    // Get WASM Module
    const mod: any = await WebAssembly.instantiate(wasm.buffer, {
        js: {
            'console.log': console.log,
            logStr: (addr : number, len : number) => {
                const str = new Uint8Array(
                    mod.instance.exports.memory.buffer,
                    len,
                    addr);
                console.log(new TextDecoder().decode(str));
            },
        },
    });

    // const fac = mod.instance.exports.nfac as CallableFunction;
    // for (let i = 0; i < 10; i++)
    //     console.log(fac(i, 0, 1));

    // const { get, set, incr }
    //     = mod.instance.exports as any;
    // console.log(get());
    // set(20);
    // console.log(get());
    // incr();
    // console.log(get());
    // incr();
    // console.log(get());

    const w = mod.instance.exports as any;
    for (let i = 0; i < 5; i++) {
        w.test(1);
        console.log([...new Uint32Array(mod.instance.exports.memory.buffer)].slice(0,4));
    }
})();