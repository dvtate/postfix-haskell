import { readFileSync } from 'fs';
import { createInterface } from 'readline';

import lex from '../lib/scan.js';
import parse from '../lib/parse.js';
import Context from '../lib/context.js';
import * as error from '../lib/error.js';
import * as util from '../tools/file_tools.js';

(async () => {
    try {
    // Read program source
    const fname : string = process.argv[2];
    const src = readFileSync(fname).toString();

    // Compile program
    const ctx = parse(lex(src, fname));
    if (ctx instanceof error.SyntaxError)
        console.error(util.formatErrorPos([ctx]));
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
            'Math.random': Math.random.bind(Math),
            'console.log': console.log.bind(console),
            logStr: (addr : number, len : number) => {
                const str = new Uint8Array(
                    mod.instance.exports.__memory.buffer,
                    len,
                    addr);
                console.log(new TextDecoder().decode(str));
            },
        },
    });


    const w = mod.instance.exports as any;

    if (process.argv[3] === 'shell') {
        // Create line reader
        const rl = createInterface ({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
            prompt: "> "
        });

        // For each line
        rl.on('line', line => {
            console.log(' => ', eval(line));
        });
    }

    else if (fname.endsWith('sqrt.phs')) {
        // Print sqrts of 1-10
        for (let i = 1; i < 10; i++)
            console.log(w.sqrt(i));
    } else if (fname.endsWith('helloworld.phs')) {
        w.main();
    } else if (fname.endsWith('fizzbuzz.phs')) {
        // Do fizzbuzz for n=1..100
        w.main(100);
    } else if (fname.endsWith('enum.phs')) {
        console.log('0 & 0 => ', w.anddemo(0, 0));
        console.log('0 & 1 => ', w.anddemo(0, 1));
        console.log('1 & 0 => ', w.anddemo(1, 0));
        console.log('1 & 1 => ', w.anddemo(1, 1));
    } else if (fname.endsWith('maybe.phs')) {
        console.log('sqrt( log( -Infinity ) ) \t=> ', w.test(-Infinity));
        console.log('sqrt( log( -1 ) ) \t\t=> ', w.test(-1));
        console.log('sqrt( log( 0 ) ) \t\t=> ', w.test(0));
        console.log('sqrt( log( 0.1 ) ) \t\t=> ', w.test(0.1));
        console.log('sqrt( log( 1 ) ) \t\t=> ', w.test(1));
        console.log('sqrt( log( 2 ) ) \t\t=> ', w.test(2));
        console.log('sqrt( log( 20 ) ) \t\t=> ', w.test(20));
        console.log('sqrt( log( 54 ) ) \t\t=> ', w.test(54));
    } else if (fname.endsWith('list.phs') || fname.endsWith('list2.phs')) {
        console.log('test ( 0 )\t=> ', w.test(0));
        console.log('test ( 1 )\t=> ', w.test(1));
        console.log('test ( 2 )\t=> ', w.test(2));
        console.log('test ( 3 )\t=> ', w.test(3));
        console.log('test ( 4 )\t=> ', w.test(4));
        console.log('test ( 5 )\t=> ', w.test(5));
    } else if (fname.endsWith('tree.phs')) {
        console.log('demo ( 3,1 )\t => ', w.demo(3,1));
        console.log('demo ( 1,3 )\t => ', w.demo(3,1));
        console.log('demo ( 1,1 )\t => ', w.demo(1,1));
    } else {
        console.log('no demo for source file', fname);
    }

} catch (e) {
    console.error(e);
}
})();
