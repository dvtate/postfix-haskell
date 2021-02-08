(module
  (func (;0;) (param i32) (result i32)
    block $branch (result i32)
      block  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block $branch (result i32)
                block  ;; label = @7
                  block  ;; label = @8
                    block $branch (result i32)
                      block  ;; label = @10
                        block  ;; label = @11
                          local.get 0
                          i32.const 5
                          i32.rem_s
                          i32.const 0
                          i32.eq
                          i32.const 0
                          i32.eq
                          i32.const 0
                          i32.eq
                          br_if 0 (;@11;)
                          i32.const 1
                          br_if 1 (;@10;)
                        end
                        i32.const 1
                        br 1 (;@9;)
                      end
                      i32.const 0
                    end
                    br_if 0 (;@8;)
                    local.get 0
                    i32.const 5
                    i32.rem_s
                    i32.const 0
                    i32.eq
                    i32.const 0
                    i32.eq
                    br_if 1 (;@7;)
                  end
                  local.get 0
                  i32.const 3
                  i32.rem_s
                  i32.const 0
                  i32.eq
                  br 1 (;@6;)
                end
                i32.const 0
              end
              br_if 0 (;@5;)
              local.get 0
              i32.const 5
              i32.rem_s
              i32.const 0
              i32.eq
              br_if 1 (;@4;)
              local.get 0
              i32.const 3
              i32.rem_s
              i32.const 0
              i32.eq
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
  (export "fb" (func 0))
  (type (;0;) (func (param i32) (result i32))))

