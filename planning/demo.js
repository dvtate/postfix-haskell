const lex = require('../lib/scan');
const parse = require('../lib/parse');
const error = require('../lib/error');
const util = require('../tools/util');
const Context = require('../lib/context');
const fs = require('fs');

// Read program source
const fname = './branch.phs';
const src = fs.readFileSync(fname).toString();

// Compile program
const ctx = parse(lex(src, fname));
if (ctx instanceof error.SyntaxError)
    console.log(utils.formatErrorPos([ctx]));
if (!(ctx instanceof Context))
    throw ctx;

// Generate WASM and check validity
const wasm = await ctx.outWasm();
const valid = WebAssembly.validate(wasm.buffer);
if (!valid)
    throw new Error("WebAssembly.validate() failed");

// Create WASM instance
const mod = await WebAssembly.instantiate(wasm.buffer, {});

// Invoke WASM Functions
console.log(mod.instance.exports.add(1, 3));