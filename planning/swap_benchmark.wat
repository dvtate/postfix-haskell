(module

    (memory (export "memory") 10)

    (func $swap_i32_f32 (param i32 f32) (result f32 i32)
        local.get 1
        local.get 2
    )


    (func $demo0
        (local $i i32) ;; 0..100k
        (local $j i32) ;; 0..100k

        loop $count
            i32.const 0
            local.set $j

            loop $movehead

                local.get $j
                i32.const 100000
                i32.le_s
                br_if $movehead
            end

            local.get $i
            i32.const 100000
            i32.le_s
            br_if $count
        end
    )

    (func $demo1


    )
)