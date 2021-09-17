  (func $update
    (local i32 i32 i32 i32 i32 i32 i32 i32)
    i32.const 0
    i32.const 0
    i32.const 12 ;; ball . dy
    i32.load
    i32.const 4 ;; ball . y
    i32.load
    i32.add
    i32.le_s
    if (result i32 i32 i32)  ;; label = @1
      i32.const 4 ;; ball . y
      i32.load
      i32.const 8 ;; ball . dx
      i32.load
      i32.const 12 ;; ball . dy
      i32.load
      i32.const 0
      i32.sub
    else
      i32.const 400
      i32.const 8 ;; ball . dx
      i32.load
      i32.const 0 ;; ball . x
      i32.load
      i32.add
      i32.ge_s
      if (result i32 i32 i32)  ;; label = @2
        i32.const 4 ;; ball . y
        i32.load
        i32.const 8 ;; ball . dx
        i32.load
        i32.const 0
        i32.sub
        i32.const 12 ;; ball . dy
        i32.load
      else
        i32.const 0
        i32.const 8 ;; ball . dx
        i32.load
        i32.const 0 ;; ball . x
        i32.load
        i32.add
        i32.le_s
        if (result i32 i32 i32)  ;; label = @3
          i32.const 4 ;; ball . y
          i32.load
          i32.const 8 ;; ball . dx
          i32.load
          i32.const 0
          i32.sub
          i32.const 12 ;; ball . dy
          i32.load
        else
          i32.const 10
          i32.const 0 ;; ball . x
          i32.load
          i32.add
          i32.const 375
          i32.const 16 (; paddle . position ;)
          i32.load
          i32.lt_s
          if (result i32)  ;; label = @4
            i32.const 0
            i32.const 16 ;; paddle . position
            i32.load
            i32.gt_s
          else
            i32.const 0
          end
          if (result i32)  ;; label = @4
            i32.const 20 ;; paddle . speed
            i32.load
            i32.const 16 ;; paddle . position
            i32.load
            i32.add
          else
            i32.const 16 ;; paddle . position
            i32.load
          end
          local.set 1 ;; paddle . position
          local.get 1
          i32.lt_s
          if (result i32)  ;; label = @4
            i32.const 0
            i32.load
            i32.const 25
            local.get 1
            i32.add
            i32.gt_s
          else
            i32.const 0
          end
          if (result i32)  ;; label = @4
            i32.const 10
            i32.const 4 ;; ball.y
            i32.load
            i32.add
            i32.const 440
            i32.lt_s
          else
            i32.const 0
          end
          if (result i32)  ;; label = @4
            i32.const 4 ;; ball.y
            i32.load
            i32.const 452
            i32.gt_s
          else
            i32.const 0
          end
          if (result i32 i32 i32)  ;; label = @4
            i32.const 430
            i32.const 8 ;; ball . dx
            i32.load
            i32.const 12 ;; ball . dy
            i32.load
            i32.const 0
            i32.sub
          else
            i32.const 4 ;; ball . y
            i32.load
            i32.const 8 ;; ball . dx
            i32.load
            i32.const 12 ;; ball . dy
            i32.load
          end
        end
      end
    end
    local.set 5 ;; ball . y
    local.set 6 ;; ball . dx
    local.set 7 ;; ball . dy
    local.get 6 ;; ball . dx
    i32.const 0 ;; ball . x
    i32.load
    i32.add
    i32.store ;; ball . x
    i32.const 4
    local.get 7
    local.get 5
    i32.add
    i32.store
    i32.const 8 ;; ball.dx
    local.get 6 ;; ball.dx
    i32.store
    i32.const 12 ;; ball . dy
    local.get 7 ;; ball . dy
    i32.store
    i32.const 16 ;; paddle . position
    local.get 1 ;; should be paddle position.
    i32.store

    ;; paddle speed unchanged - good
    i32.const 20 ;; paddle . speed
    i32.const 20 ;; paddle . speed
    i32.load
    i32.store)
  (export "update" (func 9))