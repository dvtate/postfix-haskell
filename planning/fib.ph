# Y-Combinator
{
	$f =
	{f} f
} $yc =

# Modified fibonacci
{
	{
		$rec =
		$n =

		{ 1 } {
			n -1 + {rec} rec
			n -2 + {rec} rec +
		} $cond fun
		{
			n 0 ==
			n 1 == +
		} { 1 } $cond fun
		cond
	} yc
} $fib =


