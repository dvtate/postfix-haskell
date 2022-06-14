// External
import * as fs from 'fs';

// Internal
import lex from "../lib/scan";
import parse from '../lib/parse';
import * as error from '../lib/error';
import Context from '../lib/context';

import * as util from './util';

/**
 * Compile a file to webassembly text and print it's contents
 * @param fname - name of the source file
 * @param [trackTime] - print debug info or not
 * @param [fast] - skip pretty-print and validation steps
 * @param [folding] - pretty-print formatting option
 * @param [optimize] - pass through binaryen optimizer
 * @param [stackSize] - size in bytes for ref stack lm section in rt (dword aligned)
 * @param [nuserySize] - size in bytes for the nursery lm section in rt (dword aligned)
 */
export default async function compileFile(
    fname: string,
    trackTime = true,
    fast = false,
    folding = false,
    optimize = false,
    stackSize: number = undefined,
    nurserySize: number = undefined,
    noRuntime = false,
) {
    // Replace with full, absolute path
    fname = fs.realpathSync(fname);

    // Read file
    let src: string;
    try {
        src = fs.readFileSync(fname).toString();
    } catch (e) {
        console.error('could not read file ', fname);
        throw e;
    }

    // Mock browser API - `performance.now()`
    const performance: any = globalThis.performance || {
        _hrt: process.hrtime(),
        now() {
            return process.hrtime(this._hrt)[1] / 1000000;
        },
    };

    // Lex
    let start = performance.now();
    const ptree = lex(src, fname);
    if (trackTime)
        console.log('lex:', performance.now() - start);

    try {
        // Parse (weird meaning here, more like "interpret phase")
        start = performance.now();
        const ctx = parse(ptree, new Context(fname, {
            stackSize, nurserySize, noRuntime,
            optLevel: optimize ? 3 : fast ? 1 : 2,
        }));
        if (ctx instanceof error.SyntaxError) {
            // console.log(ctx.tokens);
            console.log(util.formatErrorPos([ctx]));
            process.exit(0);
        } else if (ctx === null) {
            console.error('parse failed with null!');
            return null;
        }
        if (trackTime)
            console.log('parse:', performance.now() - start);

        // Output assembly
        start = performance.now();
        const wast = await (ctx as Context).outWast({ folding, fast, optimize, });
        // console.log(wast);
        if (trackTime)
            console.log('compile:', performance.now() - start);

        return wast;
    } catch (e) {
        if (e instanceof error.SyntaxError) {
            console.log(util.formatErrorPos([e]));
            return null;
        }
        throw e;
    }
}