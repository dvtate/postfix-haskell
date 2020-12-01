# This pops a value from the stack that we don't care about
{ $_ = } $; =

# Not operator
{ 1 }    { ; 0 } $! global fun	# Always returns false
{ 0 == } { ; 1 } $! global fun	# Unless given value is false

# And operator
{ 0 == } {	# One of the conditions is false
	; ; 0	# And result must be false
} $&& global fun
{ 0 == ! } {	# One of the conditions is true
	;		# And result will be the other condition
} $&& global fun

# Or operator
{ 0 == } {	# One of the conditions is false
	;		# Or results will be the other condition
} $|| global fun
{ 0 == ! } {	# One of the conditions is true
	; ; 1	# Or result must be true
} $|| global fun

1 ! :data
0 ! :data

0 0 && :data
1 0 && :data
0 1 && :data
1 1 && :data

0 0 || :data
1 0 || :data
0 1 || :data
1 1 || :data
