
import { writeFileSync, readFileSync, chmodSync, constants } from 'fs';
import { exec, execSync } from 'child_process';

/**
 * Environment variables
 * - PATH_PREFIX: where to find the source files for the imports
 * - NO_TSC: don't compile typescript
 */

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
    `
// For browser version this should be a url
const pathPrefix = ${process.env.PATH_PREFIX
    ? JSON.stringify(process.env.PATH_PREFIX)
    : 'import.meta.url.slice(0, -8)'};
export default \{
    // These are generated via the build.js script, do not edit directly!
    'bits' : \{
        src: ${JSON.stringify(readFileSync('./std/bits.phs').toString())},
        path: pathPrefix + 'bits.phs',
    \},
    'either' : \{
        src: ${JSON.stringify(readFileSync('./std/either.phs').toString())},
        path: pathPrefix + 'either.phs',
    \},
    'io' : \{
        src: ${JSON.stringify(readFileSync('./std/io.phs').toString())},
        path: pathPrefix + 'io.phs',
    \},
    'lang' : \{
        src: ${JSON.stringify(readFileSync('./std/lang.phs').toString())},
        path: pathPrefix + 'lang.phs',
    \},
    'list' : \{
        src: ${JSON.stringify(readFileSync('./std/list.phs').toString())},
        path: pathPrefix + 'list.phs',
    \},
    'math' : \{
        src: ${JSON.stringify(readFileSync('./std/math.phs').toString())},
        path: pathPrefix + 'math.phs',
    \},
    'maybe' : \{
        src: ${JSON.stringify(readFileSync('./std/maybe.phs').toString())},
        path: pathPrefix + 'maybe.phs',
    \},
    'mem' : \{
        src: ${JSON.stringify(readFileSync('./std/mem.phs').toString())},
        path: pathPrefix + 'mem.phs',
    \},
    'monad' : \{
        src: ${JSON.stringify(readFileSync('./std/monad.phs').toString())},
        path: pathPrefix + 'monad.phs',
    \},
    'number' : \{
        src: ${JSON.stringify(readFileSync('./std/number.phs').toString())},
        path: pathPrefix + 'number.phs',
    \},
    'str' : \{
        src: ${JSON.stringify(readFileSync('./std/str.phs').toString())},
        path: pathPrefix + 'str.phs',
    \},
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

            console.log('Marking index.js as executable');
            execSync('chmod +x ./dist/index.js');
        }
    );
