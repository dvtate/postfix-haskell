const value = require('./value');
const Macro = require('./macro');
const Fun = require('./function');

/**
 * This macro is desgined to behave like a module
 *
 * This has wrappers for important wasm instructions
 */
module.exports = new value.Value(null, value.ValueType.Macro, new Macro((ctx, token) => {

}));