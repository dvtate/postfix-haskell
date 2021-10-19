import { phs } from '../tools/inline';

(async function main(){

    const program = await phs`
    # Pop value
    { $_ = } $pop =

    # And
    # TODO improve this
    {*} $&& =

    # Enum
    -1 $fizz =
    -2 $buzz =
    fizz buzz + $fizzbuzz =

    # Fizzbuzz branching
    { 1 } { } $fb fun
    { 3 % 0 == } { pop fizz } $fb fun
    { 5 % 0 == } { pop buzz } $fb fun
    { $n = n 3 % 0 == n 5 % 0 == && } { pop fizzbuzz } $fb fun

    # Export
    #( I32 ) { fb } "fb" export

    ( I32 I32 ) { / } "di32" export
    ( I64 I64 ) { / } "di64" export
    ( F32 F32 ) { / } "df32" export
    ( F64 F64 ) { / } "df64" export
    `;

    const { fb } = program.instance.exports as any;
    for (let i = 1; i < 100; i++)
        console.log(['fizz', 'buzz', 'fizzbuzz'][-fb(i) - 1] || i);
})();
