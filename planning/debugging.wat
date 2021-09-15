 (func $update
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
    i32.const 0
    i32.const 0
    i32.const 12
    i32.load
    i32.const 4
    i32.load
    local.tee 7
    i32.add
    local.tee 5
    i32.le_s
    if (result i32 i32 i32)  ;; label = @1
      local.get 7
      local.get 2
      i32.const 12
      i32.load
      i32.const 0
      i32.sub
    else
      i32.const 400
      local.get 2
      local.get 3
      i32.add
      i32.ge_s
      if (result i32 i32 i32)  ;; label = @2
        local.get 7
        local.get 2
        i32.const 0
        i32.sub
        i32.const 12
        i32.load
      else
        i32.const 0
        i32.const 8
        i32.load
        local.tee 2
        i32.const 0
        i32.load
        local.tee 3
        i32.add
        i32.le_s
        if (result i32 i32 i32)  ;; label = @3
          local.get 7
          local.get 2
          i32.const 0
          i32.sub
          i32.const 12
          i32.load
        else
          local.get 7
          local.get 2
          i32.const 12
          i32.load
        end
      end
    end
    local.set 9
    local.set 10
    local.set 11
    local.get 10
    local.get 3
    i32.add
    local.tee 0
    i32.store
    i32.const 4
    local.get 9
    local.get 11
    i32.add
    local.tee 12
    i32.store
    i32.const 8
    local.get 10
    i32.store
    i32.const 12
    local.get 9
    i32.store
    i32.const 16
    i32.const 0
    i32.const 20
    i32.load
    local.tee 19
    i32.gt_s
    local.tee 18
    if (result i32)  ;; label = @1
      i32.const 375
      local.get 16
      i32.lt_s
      local.tee 20
    else
      i32.const 0
    end
    local.set 21
    local.get 21
    if (result i32)  ;; label = @1
      local.get 21
    else
      i32.const 0
      i32.const 20
      i32.load
      local.tee 14
      i32.lt_s
      local.tee 13
      if (result i32)  ;; label = @2
        i32.const 0
        i32.const 16
        i32.load
        local.tee 16
        i32.gt_s
        local.tee 15
      else
        i32.const 0
      end
      local.set 17
      local.get 17
      if (result i32)  ;; label = @2
        local.get 17
      else
        i32.const 0
      end
    end
    local.set 22
    local.get 22
    if (result i32)  ;; label = @1
      i32.const 20
      i32.load
      local.tee 23
      local.get 16
      i32.add
    else
      local.get 16
    end
    local.set 24
    local.get 24
    i32.store
    i32.const 20
    i32.const 20
    i32.load
    local.tee 25
    i32.store)
  (export "update" (func 6))