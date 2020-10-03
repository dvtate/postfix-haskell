const readline = require('readline');

const lex = require('../src/lex');

const cmd = process.argv.find(arg => arg[0] !== '/');

const rl = readline.createInterface ({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: "> "
});

rl.on('line', line => {
    const toks = lex(line);
    console.log(toks);
});