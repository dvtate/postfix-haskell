
# Prefixes:
# none : evaluate
# $ , ' : symbol

# Numeric Types
I64 I32 | Int typedef
F64 F32 | Float typedef
Int Float | Num typedef

# Factorial defined as a recursive function
{
	{ # Only accept numeric types
		dup Num typecheck
	} check
	
	{ # kinda like pattern matching but with explicit conditions
		{
			1
		} {
			dup 1 - $fac_fn @	
		} {
			dup 0 >
		}
	} cond
} $fac_fn =


# Factorial defined as a recursive macro
{
	{ # Only accept numberic types
		dup Num typecheck
	} check
	
	{
		{
			1 
		} {
			dup 1 - fac_mac
		} {
			dup 0 >
		}
	} cond
} "fac_mac" define


# lambda

# Factorial

{ Num typecheck } { dup 1 - * fac * } $fac defun
{ 0 == check } { 1 } $fac defun

