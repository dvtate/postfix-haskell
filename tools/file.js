const fs = require('fs');

const lex = require('../lib/parse');

console.log(process.argv);
const src = fs.readFileSync(process.argv[process.argv.length - 1]).toString();

const toks = lex.lex(src);
console.log(toks);

const ptree = lex.parse(src);
console.log(ptree);