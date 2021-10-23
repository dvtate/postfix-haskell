import { phs } from '../tools/inline';

(async function main(){

    const program = await phs`
        # TODO now that everything is in stdlib we have to import it somehow...

        # For now just simple demo
        (I32) (: 42 == ) "is_answer" export
    `;

    const { is_answer } = program.instance.exports as any;
    for (let i = 1; i < 100; i++)
        if (is_answer(i))
            console.log('the magic number is ' + i);
})();
