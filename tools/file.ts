#!/usr/bin/node

// External
import fs = require('fs');

// Internal
import lex, { NumberToken } from "../lib/scan";
import parse from '../lib/parse';
import * as error from '../lib/error';
import Context from '../lib/context';

import * as util from './util';

// Read file
const fname = process.argv[process.argv.length - 1];
const src = fs.readFileSync(fname).toString();

// Mock browser API - `performance.now()`
const performance = {
    _hrt: process.hrtime(),
    now() {
        return process.hrtime(this._hrt)[1] / 1000000;
    },
};

// Lex
let start = performance.now();
const ptree = lex(src, fname);
if (process.env.TRACK_TIME)
    console.log('lex:', performance.now() - start);

// Parse (weird meaning here, more like "interpret phase")

start = performance.now();
const ctx = parse(ptree, new Context(process.env.FAST ? 1 : 2));
if (ctx instanceof error.SyntaxError) {
    // console.log(ctx.tokens);
    console.log(util.formatErrorPos([ctx]));
}
if (process.env.TRACK_TIME)
    console.log('parse:', performance.now() - start);


// Output assembly
(async function() {
    start = performance.now();
    const wast = await (ctx as Context).outWast({
        folding: !!Number(process.env.FOLDING),
        fast: false,
        optimize: Boolean(Number(process.env.OPTIMIZE)),
    });
    console.log(wast);
    if (process.env.TRACK_TIME)
        console.log('compile:', performance.now() - start);
})();