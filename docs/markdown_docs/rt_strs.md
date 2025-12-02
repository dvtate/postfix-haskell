# Runtime Strings
## List Strings
Strings can be represented as a list of characters. This is great for internal usage but does not interface well with the host environment.

If the user must send this to the host environment they must convert it to a buffer or write a bunch of code on the host side.

## Vector Strings
String wrapper/alias around a [buffer/vector](vectors.md).