import { createInterface } from 'readline';
import { writeFileSync } from 'fs';

import lex from '../lib/scan.js';
import parse, { generatePerfSummary } from '../lib/parse.js';
import Context from '../lib/context.js';

/**
 * Launch interactive shell
 * @param lexFlag - should we debug the lexer?
 * @param verboseFlag - did user pass verbose flag?
 */
export default function runShell(lexFlag = false, verboseFlag = true) {
    // Create line reader
    const rl = createInterface ({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
        prompt: "> "
    });

    // Preserve context
    const ctx = new Context(undefined, { noRuntime: true });

    // For each line
    rl.on('line', line => {
        // TODO imports
        if (line == '#! token-timers') {
            const ret = generatePerfSummary();
            console.log(ret);
            writeFileSync('/tmp/phs.perf.dump.json', JSON.stringify(ret));
            return;
        }

        // Tokenize the line
        const toks = lex(line);
        if (lexFlag)
            console.log(toks);

        // Parse
        if (!lexFlag) {
            try {
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
            } catch (e) {
                console.log('thrown', e);
            }
        }
    });
}
