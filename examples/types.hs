-- File extension is .hs only for syntax higlhighting
-- Still undecided on comments

-- These would probably be defined in standard library
I32 I64 | Int =
F32 F64 | Float =

-- datatype
{ Int Float } FloatSequence =

-- accessor methods
{ type FloatSequence == } { destruct pop pop } $.count fun
{ type FloatSequence == } { destruct pop } $.value fun

-- create an instance
5 3.14 FloatSequence make $seq =

-- access members
seq .count -- => 5
seq .value -- => 3.14


-- sequence_t is a macro that returns a type
{ $a =
	Int
	a
} struct sequence_t =

-- accessor methods
{ type $a sequence_t == } { destruct pop pop } $.count fun
{ type $a sequence_t == } { destruct pop } $.value fun

-- Inheritance
Float sequence_t FloatSequence =

-- find sum for sequence of values
{ type $a sequence_t == } {
	-- get fields
	dup .value $value =
	.count $count =

	-- tail recursive implementation
	{
		$n =
		$v =

		{
			{ }			{ }						-- == 0 so we have result
			{ n 0 > }	{ v + v n 1 - iter }	-- > 0 move towards zero
			{ n 0 < }	{ v - v n 1 + iter }    -- < 0 move towards zero
		} cond
	} $iter =
	0 $value $count iter
} $sum fun


-- get members and methods
10 0.5 Float sequence_t make $seq =
seq .value -- => 0.5
seq .count -- => 10
seq .sum  -- => 5

