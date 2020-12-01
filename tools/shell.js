const readline = require('readline');

const lex = require('../lib/scan');
const parse = require('../lib/parse');
const Context = require('../lib/context');
const fs = require('fs');
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

// For each line
rl.on('line', line => {

    if (line.startsWith("#!load:")) {
        const fname = line.split(':')[1];
        const src = fs.readFileSync(fname).toString();
        console.log(src);
        const ev = parse(lex.parse(src, fname), ctx);
        if (!(ev instanceof Context))
            console.log(ev);
        return;
    }

    // Tokenize the line
    const toks = lex.parse(line, 'stdin');
    if (flags.includes('lex'))
        console.log(toks);

    // Parse
    if (!flags.includes('lex')) {
        if (flags.includes('verbose'))
            console.log(parse(toks, ctx));
        else {
            const e = parse(toks, ctx);
            if (e instanceof Context) {
                if (ctx.stack.length)
                    console.log(ctx.stack);
            } else {
                console.log(e);
            }
        }
    }
});
