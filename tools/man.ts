
/**
 * These are manual entries for a bunch of langauge components
 */

type DocsMap = { [k: string] : {
    name: string,
    overloadable: boolean,
    signature: string,
    description: string,
}};

export const docs: DocsMap = {
    '+' : {
        name: 'Addition',
        overloadable: true,
        signature: '<value> <value> +',
        description: 'Adds two values together',
    },
    // ....
};

// TODO some bs to generate pretty manpage thing
// TODO lots to document