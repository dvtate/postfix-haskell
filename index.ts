#!/bin/env node
import { writeFileSync } from 'fs';
import yargs from 'yargs/yargs';

import runShell from './tools/shell.js';
import compileFile from './tools/file.js';

yargs(process.argv.slice(2))
    .scriptName('phc')
    .usage('$0 <command> [args]')
    .option('verbose', {
        describe: 'include verbose output',
        type: 'boolean',
        default: false,
        alias: 'v',
    })
    .command(['shell [options]', '*'], 'run interactive shell',
        yargs =>
            yargs.options({
                'lex': {
                    describe: 'debug lexer tokens',
                    type: 'boolean',
                    default: false,
                    alias: 'l' },
            }),
        argv =>
            runShell(argv.lex, argv.verbose))
    .command('file <name> [options]', 'compile a file to WAT',
        yargs => yargs
            .positional('name', {
                describe: 'name of the file to open',
                type: 'string',
            })
            .options({
                'track-time': {
                    describe: 'track time spent compiling',
                    type: 'boolean',
                    default: true,
                    alias: 't',
                },
                'fast' : {
                    describe: 'skip validation and pretty-print steps',
                    type: 'boolean',
                },
                'folding' : {
                    describe: 'use folding/s-expr WAT syntax',
                    type: 'boolean',
                },
                'optimize' : {
                    describe: '1 to use additional internal optimizations, 2 to use binaryen optimizer',
                    type: 'number',
                    alias: 'O',
                    default: 0,
                },
                'stack-size' : {
                    describe: '(advanced) 64bit aligned size in bytes of the references stack section of LM for the runtime',
                    type: 'number',
                    default: 1024000,
                },
                'nursery-size' : {
                    describe: '(advanced) 64bit aligned size in bytes of the nusery section of LM for the runtime',
                    type: 'number',
                    default: 524288,
                },
                'output' : {
                    describe: 'output to a specific file instead of stdout',
                    type: 'string',
                    alias: 'o',
                },
                'no-rt' : {
                    describe: '(advanced) do not include boilerplate code which might be required for program to run',
                    type: 'boolean',
                },
            }),
        async argv => {
            const ret = await compileFile(
                argv.name,
                argv['track-time'],
                argv.fast,
                argv.folding,
                argv.optimize,
                argv['stack-size'],
                argv['nursery-size'],
                argv['no-rt'],
            );
            if (!argv['output'])
                return console.log(ret);
            if (ret)
                writeFileSync(argv['output'], ret);
        },
    )
    // .help()
    .argv;