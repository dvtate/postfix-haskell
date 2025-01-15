# Identifers
In the language identifiers are only bound at compile time.
And used to store a variety of values as you can see below.
Identifiers do not always physicially store a value and may be optimized out.
Depending on how they're used they can store different values and behave differently.


## Simple Values
You can use identifiers to form simple aliases for expressions.
I'm still not sure what exactly we can guarantee in terms of behavior for now just imagine worst case scenerio.

- Types
- Data
	- Numbers
	- Tuples
```

5 $a =
( 1.2 3 ) $v =

--
I32 $Int32 =
Int Float |
```
## Macros
The examples below are for Macros. This tool tells the compiler to try to replace
the bound identifer with.
```
# This Macro duplicates a value on the stack
(: $value =
	value value
) $dup =

# This macro simply wraps the + operator
(: + ) $add =

# To invoke macros simply name them
1 dup add  # => 2

# This macro ignores a value
# Note: Identifiers don't have to be simple A-z values
(: $_ = ) $; =
```

## Functions
Functions are like an associative array of conditions and macros.
The last condition to get satisfied has it's corresponding macro invoked.
Functions are the only supported form of branching (for now).

```
# Not operator
(: 1 ) (: ; 0 ) $! fun
(: 0 == ) (: ; 1 ) $! fun
```
