// Generate wat import
const fs = require('fs');
fs.writeFileSync(
    './lib/rt.wat.ts',
    `export default ${JSON.stringify(fs.readFileSync('./lib/rt.wat').toString())}`,
);

// Run compile typescript
const cp = require('child_process');
console.log('> tsc');
cp.exec(
    'tsc',
    // Remove wat import
    // () => fs.unlinkSync('./lib/rt.wat.ts'),
);