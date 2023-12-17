# Syntax Change Planning

## Tuples
### Creation
The current syntax `{ 1 2 3 } pack` will be replaced with `( 1 2 3 )`. Very simple change.

### Usage
Many of the places currently using macros will be replaced with tuples

### Unpacking
We can keep the `unpack` operator but probably should make some more tuple operators for better metaprogramming

## Macros
Macros will be changed to be like functions in my other lang. With syntax like `([type information]:<body>)`.
```php
# Takes i32 and returns i32
((I32) (I32): 1 + ) $inc =

# Takes i32 and compiler determines that it returns an i32
((I32): 1 + ) $inc =

# Compiler inlines at each call site
# Currently the only thing supported by postfix-haskell
(: 1 + ) $inc =

# Same types
$inc ~ type ((I32) (I32)) Fun ==
$inc ~ type (($a) ($a)) Fun ==
$inc ~ type ((I32)) Fun ==
$inc ~ type (($a)) Fun ==
$inc ~ type () Fun ==

# Takes a value and doesn't return anything
(($A): $_ = ) $pop =

$factorial ~ type ((I32) (I32)) RecFun ==
```

### v0.0.3 Postfix haskell
```php
{ $n =
    { { $ret $n } =
        { true } { ret n * n 1 - iter } $act fun
        { n 0 <= } { 1 } $act fun
        act
    } rec $iter =
    1 n iter
} $fac =

{I32} {fac} $factorial export
```
### New syntax
```php
# Note: could omit type annotations
((I32) (I32): $n =
    ((I32 I32) (I32) rec: ($ret $n) =
        (: true ) (: ret n * n 1 - iter ) $act fun
        (: n 0 <= ) (: 1 ) $act fun
        act
    ) $iter =
    1 n iter =
) $fac =

(I32) (: fac ) "factorial" export
```


### Before
Code taken from prelude which adds type promotion and an optimization to the builtin `==` operator.
- Note that the builtin `==` operator also accepts untyped values so we have to check for that in all the conditions to prevent syntax errors
```php
# Required boilerplate
{ { $ta $tb } =
	{ $a $b } =
	a has_type
	b has_type &&
	{ a type ta == } &&
	{ b type tb == } &&
} $_2_with_types =
{ $v =
    v is_const { v 0 == } &&
} $_is_0 =

# Add Optimization when I32 is zero
{ { $a $b } =
	a b I32 I32 _2_with_types
	b _is_0 &&
} { pop "i32.eqz" asm } $== global fun
{ { $a $b } =
	a b I32 I32 _2_with_types
	a _is_0 &&
} { swap pop "i32.eqz" asm } $== global fun

# Add Type promotion
{ I32 I64 _2_with_types } { swap I64 cast swap == } $== global fun
{ I64 I32 _2_with_types } { I64 cast == } $== global fun
{ F32 F64 _2_with_types } { swap F64 cast swap == } $== global fun
{ F64 F32 _2_with_types } { F64 cast == } $== global fun
```

### After
The `__2_with_types` boilerplate is no longer needed as untyped values are eliminated via pattern-matching
```php
(( I32 I64 | )(I32): $v =
    v is_const (: v 0 == ) &&
) $_is_0 =

((I32 I32): _is_0 ) ((I32 I32)(I32): pop "i32.eqz" asm ) $== global fun
((I32 I32): pop _is_0 ) ((I32 I32)(I32): swap pop "i32.eqz" asm ) $== global fun
((I32 I64): true ) ((I32 I64)(I32): swap I64 cast swap == ) $== global fun
((I64 I32): true ) ((I64 I32)(I32): I64 cast == ) $== global fun
((F32 F64): true ) ((F32 F64)(I32): swap F64 cast swap == ) $== global fun
((F64 F32): true ) ((F64 F32)(I32): F64 cast == ) $== global fun
```

We can even define the `has_type` operator in the language itself now.
```php
(: true ) (: false ) $has_type fun
((Any)(I32): true) (: true ) $has_type fun
```