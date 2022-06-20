#!/usr/bin/env node
import * as yargs from "yargs";

import runShell from "./tools/shell";
import compileFile from "./tools/file";
import { writeFileSync } from "fs";

yargs
    .scriptName("phc")
    .usage("$0 <command> [args]")
    .option("verbose", {
        describe: "include verbose output",
        type: "boolean",
        default: false,
        alias: "v",
    })
    .command(["shell [options]", "*"], "run interactive shell",
        yargs =>
            yargs.options({
                "lex": {
                    describe: "debug lexer tokens",
                    type: "boolean",
                    default: false,
                    alias: "l" },
            }),
        argv =>
            runShell(argv.lex, argv.verbose))
    .command("file <name> [options]", "compile a file to WAT",
        yargs => yargs
            .positional("name", {
                describe: "name of the file to open",
                type: "string",
            })
            .options({
                "track-time": {
                    describe: "track time spent compiling",
                    type: "boolean",
                    default: true,
                    alias: "t",
                },
                "fast" : {
                    describe: "skip validation and pretty-print steps",
                    type: "boolean",
                    default: false,
                },
                "folding" : {
                    describe: "use folding/s-expr WAT syntax",
                    type: "boolean",
                    default: false,
                },

                // TODO convert this to a numeric arg
                "optimize" : {
                    describe: "pass compiled output through binaryen optimizer",
                    default: false,
                    alias: "O",
                },
                "stack-size" : {
                    describe: "(advanced) 64bit aligned size in bytes of the references stack section of LM for the runtime",
                    type: "number",
                    default: 1024000,
                },
                "nursery-size" : {
                    describe: "(advanced) 64bit aligned size in bytes of the nusery section of LM for the runtime",
                    type: "number",
                    default: 524288,
                },
                "output" : {
                    describe: "output to a specific file instead of stdout",
                    type: "string",
                    alias: "o",
                },
                "no-rt" : {
                    describe: "do not include boilerplate code which might be required for program to run",
                    type: "boolean",
                    default: false,
                },
            }),
        async argv => {
            const ret = await compileFile(
                argv.name,
                argv["track-time"],
                argv.fast,
                argv.folding,
                argv.optimize,
                argv["stack-size"],
                argv["nursery-size"],
                argv["no-rt"],
            );
            if (!argv["output"])
                return console.log(ret);
            if (ret)
                writeFileSync(argv["output"], ret);
        },
    )
// .help()
    .argv;