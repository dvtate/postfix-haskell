import { phs } from '../tools/inline';

(async function main(){

    const program = await phs`
        # Now that everything is in stdlib things are more difficult
        #    because we can't simply import files from a string

        # For now just simple demo
        (I32) (: 42 == ) "is_answer" export
    `;

    const { is_answer } = (program as any).instance.exports as any;
    for (let i = 1; i < 100; i++)
        if (is_answer(i))
            console.log('the magic number is ' + i);
})();
