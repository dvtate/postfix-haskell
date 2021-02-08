(module
  (type (;0;) (func (param i32) (result i32)))
  (func (;0;) (type 0) (param i32) (result i32)
    block (result i32)  ;; label = @1
      block  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            local.get 0
            i32.const 5
            i32.rem_s
            if (result i32)  ;; label = @5
              i32.const 0
            else
              i32.const 1
            end
            i32.eqz
            i32.const 0
            local.get 0
            i32.const 5
            i32.rem_s
            select
            if (result i32)  ;; label = @5
              i32.const 0
            else
              local.get 0
              i32.const 3
              i32.rem_s
              i32.eqz
            end
            i32.eqz
            if  ;; label = @5
              local.get 0
              i32.const 5
              i32.rem_s
              i32.eqz
              br_if 1 (;@4;)
              local.get 0
              i32.const 3
              i32.rem_s
              i32.eqz
              br_if 2 (;@3;)
              local.get 0
              br_if 3 (;@2;)
            end
            i32.const -3
            br 3 (;@1;)
          end
          i32.const -2
          br 2 (;@1;)
        end
        i32.const -1
        br 1 (;@1;)
      end
      local.get 0
    end)
  (export "fb" (func 0)))
