// @ts-nocheck
// const inline = require('../dist/tools/inline');

// Load WAT source
const fs = require('fs');

const fname = 'wat.wasm';
const bin = fs.readFileSync(fname);
console.log('bin:', bin);
const valid = WebAssembly.validate(bin);
console.log('valid:', valid);

// WASM Environment
const env = {
  js: {
    mem: new WebAssembly.Memory({ initial: 1 }),
    eval: function (len, ptr) {
      // Read wasm string from memory
      const bytes = new Uint8Array(env.js.mem.buffer, ptr, len);
      const str = new TextDecoder('utf8').decode(bytes);

      // Execute the string as JS Code lmao
      eval(str);
    },
    'console.log': console.log,
  },
};

// Invoke wasm export
WebAssembly.instantiate(bin, env).then(mod => {
  // mod.instance.exports.main();

  // Test fac
  for (let i = 0n; i < 10n; i++)
    console.log(mod.instance.exports.fac(i));

  // Test abs
  for (let i = -4; i < 5; i++)
    console.log(mod.instance.exports.abs(i));

}).catch(e => console.error(e));