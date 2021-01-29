

const { phs } = require('../tools/inline');

(async function main(){

    const program = await phs`
    { $_ = } $; =

    -1 $fizz =
    -2 $buzz =
    fizz buzz + $fizzbuzz =

    { } { } $fb fun
    { 3 % 0 == } { ; fizz } $fb fun
    { 5 % 0 == } { ; buzz } $fb fun
    { $n = n 3 % 0 == n 5 % 0 == * } { ; fizzbuzz } $fb fun
    { I32 } { fb } $fb target

    { 1 } { ; 0 } $not fun
    { 0 == } { ; 1 } $not fun
    { I32 } { not } $not target

    `;

    const { not, fb } = program.instance.exports;
    const labels = {
        '-1': 'fizz',
        '-2': 'buzz',
        '-3': 'fizzbuzz',
    };
    for (let i = 0; i < 100; i++)
        console.log(labels[fb(i)] || i);
})();