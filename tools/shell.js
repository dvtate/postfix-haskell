const { stat } = require('fs');
const readline = require('readline');

const lex = require('../lib/scan');
const parse = require('../lib/parse');
const Context = require('../lib/context');
const ctx = new Context();

const flags = process.argv
    .filter(arg => arg.startsWith('--'))
    .map(a => a.substr(2));

const rl = readline.createInterface ({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: "> "
});


rl.on('line', async line => {
    const toks = lex.parse(line);
    if (flags.includes('lex'))
        console.log(toks);

    if (!flags.includes('lex')) {
        console.log(parse(toks, ctx));
    }
});