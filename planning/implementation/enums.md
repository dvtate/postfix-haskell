# Enums

## Memory layout
All enums consist of 2 i32 values
```
-----------
| i32 - Index - which type is stored?
-----------
| i32 - address of the actual value stored
-----------
```

## Semantics
Normally the Index is stored on the WASM stack and the address is stored on the ref stack thus accesses can be performed in either order.

## Syntax

### Pattern Matching
This way of defining enums allows us to use the same function overloading system we currently use for pattern matching.

```phs
# WIP syntax for recursive enum type definition for an LL
I32 I64 | F32 F64 | | $Num =
(rec:
    (: ( Num List ) ) class $Node =
    () class $Nil =
) enum $NumList =

# When tracing fill stack with dummy values
(rec:
    $T =
    (: ( T T List ) ) class $Node =
    () class $Nil =
) enum $List =

# Let's define a function to find the minimum value in a list

# No Pattern Matching
(: type List.Nil == ) (: pop Infinity ) $min fun
(: type List.Node == ) (: unpack min' ) $min fun

# With Pattern Matching
((Any List.Node): 1 ) (:
    unpack ( $v $n ) = $pv =
    (: 1 ) (: v n min' ) $branch fun
    (: v pv < ) (: pv n min' ) $branch fun
    branch
) $min' fun
((Any List.Nil): 1 ) (: pop ) $min' fun

# Make LL
( 3 ( 4 ( 0
    () List.Nil make ) List.Node make ) List.Node make ) List.Node make
$ll =

# find min value
ll min :data # 0
```

## Types
### EnumClassType
Type of variant object

### EnumChildType
Type of one of the possible children contained in the enum. If child type is (I64, I64), typecheck would verify that it is also of the Enum Parent Type type.

## Values
- `EnumExpr`: When type of enum is unknown
- `EnumValueExpr` ?: When type is known but value is unknown
- when type and value are known, just use regular `DataValue` class
