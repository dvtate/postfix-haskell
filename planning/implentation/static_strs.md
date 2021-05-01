# String Literals
In static memory `(data ...)` will be stored string literals and perhaps other initializer data. It will be combined into a single long string that.

## Goals
### Static Storage Space Reduction

#### Literal Re-use
##### Intra
Imagine the user adds the string `abcdefghijk`, afterwards if they add the string `def` it will use a pointer to the middle of the other one
##### Inter
Imagine the user adds the string `moon` and then `shine` and then later on needs the string `moonshine`. In an ideal scenerio the strings would be put next to eachother so that there's less redundant data.

#### Unused Literal elimination
is this really a concern? Lazy evaluation should solve this, right?

## Naive Implementation
Upon encountering a string literal that's used in `parse`, put it in a `Context` member (ie - `staticMemory`) containing an `Int8Array` of chars that will be put into static memory. If the relevant sequence of chars is already in the `staticMemory` array we will use a pointer to that occurence to it instead of making a poniter to the end and appending the string.

### Problems
- Ordering not optimal giving bad intra-literal optimization
- Some string literals will go unused but still end up in the static data section

## Optimal Implementation?
- When we need a static string put onto the stack it's length and a `ConstExprValue` for the pointer
- Walk the graph IR, extracting string literals, this gives us only the ones that are used
- Sort string literals by descending length
- construct the static memory section by inserting them in this same order, optimizing re-use
- As the IR is translated replace pointers with those from static memory and finish the `ConstExprValue` calculations.

### New `Value`[`Type`] - `ConstExprValue`
- Treated like an Expr, but when passed to recursive funcitons... ?
- Memory accesses can be done compile-time
- maybe a reference type instead? with some indication to the string ltieral stored elsewhere?