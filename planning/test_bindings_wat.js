const inline = require('../tools/inline');

const src = `(module
    (import "js" "fun" (func $imp (param i32) (param i32) (result i32)))
    (func (export "outfun") (param i32) (param i32) (result i32)
        local.get 0
        local.get 1
        call $imp
    )
)`;

inline.compileWat(src, { js: { fun: (a, b) => a + b }}).then(mod => {
    console.log(mod.instance.exports.outfun(1, 2));
});