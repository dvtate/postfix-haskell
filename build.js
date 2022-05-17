// Generate wat import
const fs = require('fs');
fs.writeFileSync(
    './lib/rt.wat.ts',
    `export default ${JSON.stringify(fs.readFileSync('./lib/rt.wat').toString())
    };\n\nexport const noRuntime = ${JSON.stringify(fs.readFileSync('./lib/no_rt.wat').toString())};`,
);

// Run compile typescript
const cp = require('child_process');
console.log('> tsc');
cp.exec(
    'tsc',
    (err, stdout, stderr) => {
        if (err)    console.error(err);
        if (stdout) console.log(stdout);
        if (stderr) console.error(stderr);

        // Remove wat import (keep for ide)
        // fs.unlinkSync('./lib/rt.wat.ts');
    }
);