
{
	$n =
		{ 1 } {
			n -1 + fib
			n -2 + fib +
		} $cond fun
		{
			n 0 ==
			n 1 == +
		} { 1 } $cond fun
		cond
} $fib =
