#!/usr/bin/node

// External
const fs = require('fs');

// Internal
const lex = require('../lib/scan');
const parse = require('../lib/parse');
const error = require('../lib/error');
const utils = require('./util');

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
const ptree = lex.parse(src, fname);
if (process.env.TRACK_TIME)
    console.log('lex:', performance.now() - start);

// Parse (weird meaning here, more like "interpret phase")
start = performance.now();
const ctx = parse(ptree);
if (ctx instanceof error.SyntaxError) {
    // console.log(ctx.tokens);
    console.log(utils.formatErrorPos([ctx]));
}
if (process.env.TRACK_TIME)
    console.log('parse:', performance.now() - start);


// Output assembly
(async function() {
    start = performance.now();
    const wast = await ctx.outWast({
        folding: !!Number(process.env.FOLDING),
        beautify: true,
        optimize: Number(process.env.OPTIMIZE),
    });
    console.log(wast);
    if (process.env.TRACK_TIME)
        console.log('compile:', performance.now() - start);
})();