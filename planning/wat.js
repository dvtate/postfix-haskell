// const inline = require('../dist/tools/inline');

// Load WAT source
const fs = require('fs');

/*
const fname = '/home/tate/Desktop/postfix-haskell/planning/wat.wasm';
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
		test: function(n) {
			return [n, n];
		}
	},
};

// Invoke wasm export
inline.compileWat(src, env).then(mod => {
	mod.instance.exports.main();
}).catch(e => console.error(e));
*/

const fname = '/home/tate/Desktop/postfix-haskell/planning/wat.wasm';
const bin = fs.readFileSync(fname)
const valid = WebAssembly.validate(bin.buffer);
if (!valid)
	console.error("wasm invalid!", valid);
else
	WebAssembly.instantiate(bin.buffer, importObject).then(m =>
		m.instance.exports.main())
	.catch(console.error);
