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
    const toks = lex(src, fname);
    const ctx = parse(toks, new Context(toks[0].file /*, { optLevel: 2 }*/));
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

            // Note string here needs to be 
            logStrList: (addr: number) => {
                class StrLLNode {
                    dv: DataView;
                    constructor(addr: number) {
                        this.dv = new DataView(mod.instance.exports.__memory.buffer, addr, 3 * 4);
                        // console.log(
                        //     addr, "StrLLNode(",
                        //     this.dv.getUint32(0, true), ",",
                        //     this.dv.getUint32(4, true), ",",
                        //     this.dv.getUint32(8, true), ')',
                        // );
                    }
                    getChar(): string {
                        return String.fromCharCode(this.dv.getUint32(0, true));
                        // return (this.dv.getUint32(4, true) !== 0)
                        //     ? String.fromCharCode(this.dv.getUint32(0, true))
                        //     : '';
                    }
                    next(): StrLLNode {
                        return  (this.dv.getUint32(4, true) !== 0)
                            ? new StrLLNode(this.dv.getUint32(8, true))
                            : null;
                    }
                    getString() {
                        let ret = '';
                        let n: StrLLNode = this;
                        do {
                            ret += n.getChar();
                            n = n.next();
                        } while (n !== null);
                        return ret;
                    }
                }

                return console.log(new StrLLNode(addr).getString());
            }
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
        console.log('demo ( 10 )');
        w.demo(10);
    } else if (fname.endsWith('strl.phs')) {
        for (let i = 0; i < 10; i++) {
            const n = Math.floor(Math.random() * (1 << 30) - (1 << 30) / 2);
            // let n = i * 213;
            console.log('test(', n,')');
            w.test(n);
        }
    } else {
        console.log('no demo for source file', fname);
    }

} catch (e) {
    if (!(e instanceof error.SyntaxError))
        console.error(e);
}
})();
