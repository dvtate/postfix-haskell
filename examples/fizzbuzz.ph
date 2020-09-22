

; numeric types
I32 I64 | Int =
F32 F64 | Float =
Int Float | Num =

# Absolute value function
{ type Num == } { } $abs defun			# by default leave the value on the stack
{ 0 < check } { 0 swap - } $abs defun	# if the value is negative, make it positive



# Function fizzbuzz
{ type Num == check } {
	$n =

	# Make a lambda fb_repr that converts a number to fizzbuzz notation
	{
		{ # branch
			{ dup 3 % 0 == check 5 % 0 == check }	{ pop "fizzbuzz" }
			{ dup 3 % 0 == check }					{ pop "fizz" }
			{ dup 5 % 0 == check }					{ pop "buzz" }
			{ }										{ repr }
		} cond
	} $fb_repr =

	# for i goes from 0 to n
	{
		$i =

		i fb_repr ++ " " ++

		# Loop while i < n
		i { { n < } { 1 + iter } } cond
	} $iter =
	"" 0 iter

} $fizzbuzz defun


# Note constexpr
100 fizzbuzz print

