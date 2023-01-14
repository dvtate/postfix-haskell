
import { writeFileSync, readFileSync } from 'fs';
import { exec } from 'child_process';


// It really sucks that there isn't a viable preprocessor for TypeScript
console.log("Compensating for TypeScript's lack of a preprocessor...");

// Generate runtime source file
// TODO OPTIMIZE strip comments from WAT?
writeFileSync(
    './lib/rt.wat.ts',
    `export default ${JSON.stringify(readFileSync('./lib/rt.wat').toString())
    };\n\nexport const noRuntime = ${JSON.stringify(readFileSync('./lib/no_rt.wat').toString())};`,
);
console.log('Generated runtime source import');

// Make standard library not dependent on file-system (ie - for use within browser)
writeFileSync(
    './std/index.ts',
    `export default \{
        // These are generated via the build.js script, do not edit directly!
        'bits' : ${JSON.stringify(readFileSync('./std/bits.phs').toString())},
        'either' : ${JSON.stringify(readFileSync('./std/either.phs').toString())},
        'io' : ${JSON.stringify(readFileSync('./std/io.phs').toString())},
        'lang' : ${JSON.stringify(readFileSync('./std/lang.phs').toString())},
        'list' : ${JSON.stringify(readFileSync('./std/list.phs').toString())},
        'math' : ${JSON.stringify(readFileSync('./std/math.phs').toString())},
        'maybe' : ${JSON.stringify(readFileSync('./std/maybe.phs').toString())},
        'mem' : ${JSON.stringify(readFileSync('./std/mem.phs').toString())},
        'monad' : ${JSON.stringify(readFileSync('./std/monad.phs').toString())},
        'number' : ${JSON.stringify(readFileSync('./std/number.phs').toString())},
        'str' : ${JSON.stringify(readFileSync('./std/str.phs').toString())},
    \};`,
);
console.log('Generated standard library import');

// Run tsc
console.log('Compiling TypeScript');
if (!process.env.NO_TSC)
    exec(
        'tsc',
        (err, stdout, stderr) => {
            if (err)    console.error(err);
            if (stdout) console.log(stdout);
            if (stderr) console.error(stderr);

            // Remove wat import (keep for ide)
            // fs.unlinkSync('./lib/rt.wat.ts');

            console.log('Compiled TypeScript');
        }
    );