# Vectors
Vectors/buffers are blocks of contiguous linear memory. This is useful for strings.

## Key features
- Be able to access (volatile) memory address
- Get length of the buffer

## Reminders
- Memory is allocated on the GC via the `__alloc` runtime function which accepts a number of i32's to allocate and an address to a bitfield representing which of those i32's contain pointers.

## Implementation idea 1
In order for the GC to allocate arbitrary amounts of memory, the `__alloc` runtime function has to have specific behavior.

- For non-reference types we pass `(i32.const 0)` as the $ref_bitfield_addr argument so that the gc ignores the vector's contents.
- For reference types we we pass `(i32.const 0)` as the $ref_bitfield_addr argument. Because static data doesn't start until after the stack this should be fine.

Behavior has to be modified elsewhere to support this.

### Problems
- This implementation would not support tuple types containing references without making them GC constructed.


## Implementation idea 2
Pass a ref_bitfield_addr corresponding to a single element of the vector. The GC would also need to know exactly how long the bitfield is  The gc would have to be smart enough to apply this bitfield repeatedly until it 