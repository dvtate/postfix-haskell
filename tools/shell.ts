import readline = require('readline');

import lex from '../lib/scan';
import parse from '../lib/parse';
import Context from '../lib/context';
import fs = require('fs');

const flags = process.argv
    .filter(arg => arg.startsWith('--'))
    .map(a => a.substr(2));

const rl = readline.createInterface ({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: "> "
});

// Preserve context
const ctx = new Context();


// For each line
rl.on('line', line => {

    // TODO imports
    if (line.startsWith("#!load:")) {
        const fname = line.split(':')[1];
        const src = fs.readFileSync(fname).toString();
        console.log(src);
        const ev = parse(lex(src, fname), ctx);
        if (!(ev instanceof Context))
            console.log(ev);
        return;
    }

    // Tokenize the line
    const toks = lex(line, 'stdin');
    if (flags.includes('lex'))
        console.log(toks);

    // Parse
    if (!flags.includes('lex')) {
        const e = parse(toks, ctx);
        if (flags.includes('verbose'))
            return console.log(e);

        if (e instanceof Context) {
            if (e.stack.length)
                console.log(e.stack);
            return;
        }

        console.log(e);
    }
});
