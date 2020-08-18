const fs = require('fs');

const {lex} = require('../src/lex');

console.log(process.argv);
const src = fs.readFileSync(process.argv[process.argv.length - 1]).toString();

console.log(lex(src));