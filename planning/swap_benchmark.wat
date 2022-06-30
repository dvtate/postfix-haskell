(module

    (memory (export "memory") 10)

    (func $swap_i32_f32
        (param f32 i32)
        (result i32 f32)
        local.get 1
        local.get 0
    )

    (func (export "swap")
        (local $i i32) ;; 0..50k
        (local $j i32) ;; 0..50k

        loop $count
            i32.const 0
            local.set $j

            loop $movehead
                local.get $i
                f32.reinterpret_i32
                local.get $j
                call $swap_i32_f32
                f32.store

                local.get $j
                i32.const 1
                i32.add
                local.set $j

                local.get $j
                i32.const 50000
                i32.le_s
                br_if $movehead
            end

            local.get $i
            i32.const 1
            i32.add
            local.set $i

            local.get $i
            i32.const 50000
            i32.le_s
            br_if $count
        end
    )

    (func (export "no_swap")
        (local $i i32) ;; 0..50k
        (local $j i32) ;; 0..50k

        loop $count
            i32.const 0
            local.set $j

            loop $movehead
                local.get $j
                local.get $i
                f32.reinterpret_i32
                f32.store

                local.get $j
                i32.const 1
                i32.add
                local.set $j

                local.get $j
                i32.const 50000
                i32.le_s
                br_if $movehead
            end

            local.get $i
            i32.const 1
            i32.add
            local.set $i

            local.get $i
            i32.const 50000
            i32.le_s
            br_if $count
        end
    )

)