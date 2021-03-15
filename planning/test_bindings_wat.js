const inline = require('../tools/inline');

const src = `(module
    (import "js" "fun" (func $log (param f64)))
    (func (export "sqrt") (param f64) (result f64)
        (local f64 f64 f64)
        local.get 0
        local.set 1
        f64.const 0x1p+0 (;=1;)
        local.set 2
        loop (result f64)  ;; label = @1

        ;; debug
        (;local.get 1
        call $log
        local.get 2
        call $log;)

                local.get 1
      local.get 1
      f64.mul
      local.get 2
      f64.sub
      f64.const 0x0p+0 (;=0;)
      f64.lt
      if (result f64)  ;; label = @2
        local.get 1
        local.get 1
        f64.mul
        local.get 2
        f64.sub
        f64.const -0x1p+0 (;=-1;)
        f64.mul
      else
        local.get 1
        local.get 1
        f64.mul
        local.get 2
        f64.sub
      end
      local.get 2
      f64.div
      f64.const 0x1.0624dd2f1a9fcp-10 (;=0.001;)
      f64.lt
      if (result f64)  ;; label = @2
        local.get 1
      else
        local.get 1
        local.get 2
        f64.div
        local.get 1
        f64.add
        f64.const 0x1p+1 (;=2;)
        f64.div
        local.set 1
        local.get 2
        local.set 2
        br 1 (;@1;)
      end
    end
    local.set 3
    local.get 3)
)`;

inline.compileWat(src, { js: { fun: console.log }}).then(mod => {
    console.log(mod.instance.exports.sqrt(2));
});
