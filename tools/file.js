const fs = require('fs');

const lex = require('../lib/scan');
const parse = require('../lib/parse');
const error = require('../lib/error');

const fname = process.argv[process.argv.length - 1];
const src = fs.readFileSync(fname).toString();

// const toks = lex.lex(src);
// console.log(toks);

// Mock browser API
const performance = {
    _hrt: process.hrtime(),
    now() {
        return process.hrtime(this._hrt)[1] / 1000000;
    }
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
    const utils = require('./util');
    // console.log(ctx.tokens);
    console.log(utils.formatErrorPos([ctx]));
}
if (process.env.TRACK_TIME)
    console.log('parse:', performance.now() - start);


start = performance.now();
ctx.outWast({ folding: false }).then(asm => {
    console.log(asm);
    if (process.env.TRACK_TIME)
        console.log('compile:', performance.now() - start);
});