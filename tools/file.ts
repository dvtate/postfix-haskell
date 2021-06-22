#!/usr/bin/node

// External
import fs = require('fs');

// Internal
import lex, { NumberToken } from "../lib/scan";
import parse from '../lib/parse';
import * as error from '../lib/error';
import Context from '../lib/context';

import * as util from './util';

/***
 * Compile a file to webassembly text and print it's contents
 * @param fname - name of the source file
 * @param [trackTime] - print debug info or not
 * @param [fast] - skip pretty-print and validation steps
 * @param [folding] - pretty-print formatting option
 * @param [optimize] - pass through binaryen optimizer
 */
export default async function compileFile(
    fname: string,
    trackTime: boolean = true,
    fast: boolean = false,
    folding: boolean = false,
    optimize: boolean = false,
) {
    // Read file
    const src = fs.readFileSync(fname).toString();

    // Mock browser API - `performance.now()`
    const performance = globalThis.performance || {
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

    // Parse (weird meaning here, more like "interpret phase")

    start = performance.now();
    const ctx = parse(ptree, new Context(process.env.FAST ? 1 : 2));
    if (ctx instanceof error.SyntaxError) {
        // console.log(ctx.tokens);
        console.log(util.formatErrorPos([ctx]));
        process.exit(0);
    }
    if (trackTime)
        console.log('parse:', performance.now() - start);

    // Output assembly
    start = performance.now();
    const wast = await (ctx as Context).outWast({ folding, fast, optimize, });
    console.log(wast);
    if (trackTime)
        console.log('compile:', performance.now() - start);

    return wast;
}
