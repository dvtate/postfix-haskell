-- File extension is .hs only for syntax higlhighting
-- Still undecided on comments

-- These would probably be defined in standard library
I32 I64 | $Int =
F32 F64 | $Float =

-- datatype
{ Int Float } newtype $FloatSequence =

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

-- Likely defined in std lib
I32 I64 | $Int =
F32 F64 | $Float =

-- make a structure consiting of two member types
{ Int Float } type $FloatSeq =

--
{ typeof FloatSequence == } { destruct pop pop } $.count fun
{ typeof FloatSequence == } { destruct pop } $.value fun

--
{ $A = Int A } type $Seq =
