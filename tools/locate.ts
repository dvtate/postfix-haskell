import { LexerToken } from "../lib/scan";
import { formatErrorPos, fileLocate } from "./util";

// Help message
if (process.argv.length < 5) {
    console.error("usage: file position length")
    process.exit(1);
}

// Get args
const file = process.argv[2];
const position = Number(process.argv[3]);
const tokenLength = Number(process.argv[4]);

const loc = fileLocate(file, position);
console.log({ file, position, tokenLength, loc });

console.log(formatErrorPos([{
    name: 'locate',
    message: 'location in the file',
    tokens: [new LexerToken(
        new Array(tokenLength).fill('t').join(''),
        LexerToken.Type.Identifier,
        position,
        file,
    )],
}]));