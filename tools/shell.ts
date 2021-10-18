import readline = require('readline');
import fs = require('fs');

import lex from '../lib/scan';
import parse from '../lib/parse';
import Context from '../lib/context';

/**
 * Launch interactive shell
 * @param lexFlag - should we debug the lexer?
 * @param verboseFlag - did user pass verbose flag?
 */
export default function runShell(lexFlag = false, verboseFlag = true) {
    // Create line reader
    const rl = readline.createInterface ({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
        prompt: "> "
    });

    // Preserve context
    const ctx = new Context(2);

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
        const toks = lex(line);
        if (lexFlag)
            console.log(toks);

        // Parse
        if (!lexFlag) {
            const e = parse(toks, ctx);
            if (verboseFlag)
                return console.log(e);

            if (e instanceof Context) {
                if (e.stack.length)
                    console.log(e.stack);
                return;
            }

            // Print errors and stuff
            console.log(e);
        }
    });
}
