const fs = require('fs');

const lex = require('../lib/scan');
const parse = require('../lib/parse');

console.log(process.argv);
const fname = process.argv[process.argv.length - 1];
const src = fs.readFileSync(fname).toString();

// const toks = lex.lex(src);
// console.log(toks);

const ptree = lex.parse(src, fname);
// console.log(ptree);

const ctx = parse(ptree);
console.log(ctx.stack);