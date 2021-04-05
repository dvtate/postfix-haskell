const inline = require('../tools/inline');

// Load WAT source
const fs = require('fs');
const fname = '/home/tate/Desktop/postfix-haskell/planning/wat.wat';
const src = fs.readFileSync(fname).toString();

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
	},
};

// Invoke wasm export
inline.compileWat(src, env).then(mod => {
	mod.instance.exports.main();
}).catch(e => console.error(e));