const fs = require('fs');

const lex = require('../lib/scan');
const parse = require('../lib/parse');

const fname = process.argv[process.argv.length - 1];
const src = fs.readFileSync(fname).toString();

// const toks = lex.lex(src);
// console.log(toks);

const ptree = lex.parse(src, fname);
// console.log(ptree);
// console.log(ptree);



const ctx = parse(ptree);
const error = require('../lib/error');

if (ctx instanceof error.SyntaxError) {
    const utils = require('./util');
    // console.log(ctx.tokens);
    console.log(utils.formatErrorPos([ctx]));
}