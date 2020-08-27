const fs = require('fs');

const { parse, lex } = require('../src/parse');

console.log(process.argv);
const src = fs.readFileSync(process.argv[process.argv.length - 1]).toString();

const toks = lex.lex(src);
console.log(toks);

const ptree = parse(toks);
console.log(ptree);