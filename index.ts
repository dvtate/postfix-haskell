#!/usr/bin/env node
import yargs = require('yargs');

import runShell from './tools/shell';
import compileFile from './tools/file';

yargs
    .scriptName('phaskell')
    .usage('$0 <command> [args]')
    .option('verbose', {
        describe: 'include verbose output',
        type: 'boolean',
        default: false,
        alias: 'v',
    })
    .command(['shell', '*'], 'run interactive shell',
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
    .command('file [name]', 'compile a file to WAT',
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
                    default: false,
                },
                'folding' : {
                    describe: 'use folding/s-expr WAT syntax',
                    type: 'boolean',
                    default: false,
                },
                'optimize' : {
                    describe: 'pass compiled output through binaryen optimizer',
                    type: 'boolean',
                    default: false,
                    alias: 'O',
                },
            }),
        argv => compileFile(argv.name, argv['track-time'], argv.fast, argv.folding, argv.optimize))
    .help()
    .argv;