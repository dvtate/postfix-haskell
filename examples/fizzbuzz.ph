# Quick Intro
# Although language is stack-oriented, it's only used to generate expressions
#

'wasm' use

# Numeric types
I32 I64 | Int =
F32 F64 | Float =
Int Float | Num =

# Absolute value defined as a function
#  Functions allow user to overload it later if needed

# Not negative: leave it on stack
{ type Num == } { } 		 $abs defun

# Negative: make it positive
{ 0 < } 		{ -1 * } $abs defun

# Absolute value defiend as a macro
#  these are like lambdas
{
	{
		{ type Num == } { }
		{ 0 < }			{ -1 * }
	} cond
} $abs2 =


# Function fizzbuzz
# Accepts numbers of any sign
{ type Num == } {
	# Pull n from top of stack
	$n =

	# Make a lambda fb_repr that converts a number to fizzbuzz notation
	{
		{
			{ }							{ repr }
			{ 3 % 0 == }			    { pop "fizz" }
			{ 5 % 0 == }				{ pop "buzz" }
			{ 3 % 0 == 5 % 0 == && }	{ pop "fizzbuzz" }
		} cond
	} $fb_repr =

	# Generate fizzbuzz for i goes from 0 to n
	{
		{ { n < } {

			# Pop i from top of stack
			$i =

			# Add text to string that was below i
			i fb_repr ++ " " ++

			# Push i back onto stack
			i

			# Loop while i < n
			iter
		}} cond
	} $iter =
	"" 0 iter

} $fizzbuzz defun
{ 0 < } { abs fizzbuzz } $fizzbuzz defun

# Get value
100 fizzbuzz print
