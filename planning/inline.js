

const { phs } = require('../tools/inline');

(async function main(){

    const program = await phs`
    # Booleans
    1 $true =
    0 $false =

    # Stack operators
    { $_ = } $pop =				# Pop value
    { $v = v v } $dup =			# Duplicate value
    { $b = $a = b a } $swap =	# swap values

    # Not operator
    { 1 }    { pop 0 } $! global fun	# Always returns false
    { 0 == } { pop 1 } $! global fun	# Unless given value is false

    # And operator
    { 0 == } {	# One of the conditions is false
        pop pop 0	# And result must be false
    } $&& global fun
    { 0 == ! } {	# One of the conditions is true
        pop		# And result will be the other condition
    } $&& global fun

    -1 $fizz =
    -2 $buzz =
    fizz buzz + $fizzbuzz =

    { } { } $fb fun
    { 3 % 0 == } { pop fizz } $fb fun
    { 5 % 0 == } { pop buzz } $fb fun
    { $n = n 3 % 0 == n 5 % 0 == && } { pop fizzbuzz } $fb fun
    { I32 } { fb } $fb target
    `;

    const { not, fb } = program.instance.exports;
    for (let i = 1; i < 100; i++)
        console.log(['fizz', 'buzz', 'fizzbuzz'][-fb(i) - 1] || i);
})();
