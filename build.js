// Generate wat import
// TODO OPTIMIZE strip comments from WAT?
import { writeFileSync, readFileSync } from 'fs';
writeFileSync(
    './lib/rt.wat.ts',
    `export default ${JSON.stringify(readFileSync('./lib/rt.wat').toString())
    };\n\nexport const noRuntime = ${JSON.stringify(readFileSync('./lib/no_rt.wat').toString())};`,
);

// Run compile typescript
import { exec } from 'child_process';
console.log('> tsc');
exec(
    'tsc',
    (err, stdout, stderr) => {
        if (err)    console.error(err);
        if (stdout) console.log(stdout);
        if (stderr) console.error(stderr);

        // Remove wat import (keep for ide)
        // fs.unlinkSync('./lib/rt.wat.ts');
    }
);