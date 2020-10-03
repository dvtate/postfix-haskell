
# Like an object factory
{
    fun $ret =
    {} { null } $ret defun
} $make_map =


# Function to add items to map
fun $set =
{ # takes 3 arguments with bottom one being a Function
    drop drop type Fun ==
} {
    # Pull args
    $value =
    $key =
    $map =

    { $key == } {}

} $set defun

# Set up config, this has to be done at compile time
make_map $config =
$config "email" "toast27@gmail.com" set
$config "age" 20 set
$config 4 "four" set


#
"email" config print
