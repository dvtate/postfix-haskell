-- File extension is .hs only for syntax higlhighting
-- Still undecided on comments

-- These would probably be defined in standard library
{ I32 I64 | } $Int =
{ F32 F64 | } $Float =

-- datatype
{ Int Float } struct newtype $FloatSequence =

-- accessor methods
{ typeof FloatSequence == } { destruct pop pop } $.count fun
{ typeof FloatSequence == } { destruct pop } $.value fun

-- create an instance
5 3.14 FloatSequence make $seq =

-- access members
seq .count -- => 5
seq .value -- => 3.14

-- Sequence is a macro that returns a type
{ $A =
	Int
	A
} newtype $Sequence =

-- accessor methods
{ typeof $A Sequence == } { destruct pop pop } $.count fun
{ typeof $A Sequence == } { destruct pop } $.value fun

-- Aliasing
Float Sequence FloatSequence =

-- Creating a new type with same structure
-- Functions that Accept a Sequence type will not accept this new type
Float Sequence newtype FloatSeq =


-- find sum for sequence of values
{ typeof $A Sequence == } {
	-- get fields
	dup .value $value =
	.count $count =

	-- tail recursive implementation
	{
		$n =
		$v =

		{
			{ }			{ }							-- == 0 so we have result
			{ n 0 > }	{ v + v 1 + n 1 - iter }	-- > 0 move towards zero
			{ n 0 < }	{ v - v 1 + n 1 + iter }    -- < 0 move towards zero
		} cond
	} $iter =
	0 $value $count iter
} $sum fun

-- get members and methods
10 0.5 Float Sequence make $seq =
seq .value -- => 0.5
seq .count -- => 10
seq .sum  -- => 5


-- Here we're defining a union type
F32 F64 | $Float =

-- Like for expressions, braces can be used for lazy evaluation
{ I32 I64 | } $Int =

-- Here we specify a tuple type
{ Int Float } pack $IntFloatPair =

-- Using the `class` operator makes the type more strict
--  It will only accept instances of the same type
IntFloatPair class $FloatSeq =

-- Notice that class expects either a type or macro as argument
{ { Int Int } pack } class $IntSeq =

-- We can emulate objects by defining access operators
{ type FloatSeq == } { unpack pop } $.count fun
{ type FloatSeq == } { unpack swap pop } $.value fun

-- Use the make operator to make an instance of a class
{ 10 3.14 } pack FloatSeq make $seq =
seq .value -- => 3.14
seq .count -- => 10

-- Equvalent to methods
-- This method performs scalar mulitplication
{ $s = $v =
	v type Float Int | ==
	s type FloatSeq == &&
} {
	$seq = $v =
	{ seq .count seq .value v * } pack FloatSeq make
} $.mul_scalar fun

2 seq .mul_scalar $seq2 =

-- Operator overloading
{ $v1 = $v0 =
	v0 type FloatSeq ==
	v1 type FloatSeq == &&
} {
	$v1 = $v0 =
	v0 .value v0 .count * $total =
	total v1 .count total type convert / $delta =
	{ v1 .count v1 .value delta + } pack FloatSeq make
} $+ fun

seq seq2 + $seq3 =

-- Parametric type to describe Sequence of a given type
--  Impl: maybe class creates wrapper that modifies whatever type is returned w/ id
{ $T =
	{ Int T } pack
} class $Sequence =

-- Using $_ because we don't care what given type is
{ type $_ Sequence = } { unpack pop } $.count fun
{ type $_ Sequence = } { unpack swap pop } $.value fun

-- Make instance
{ 10 3.14 } pack Float Sequence make $seq =

-- Make specialized type alias
Float Sequence $FloatSequence =

-- these function only accept int sequences
{ type Int Sequence == } {} $myfun fun
{ type unpack Int == } {} $myfun2 fun
