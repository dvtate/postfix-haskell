import { readFileSync } from 'fs';
import * as lex from '../lib/scan.js';

export interface FileSnapshot {
    line: string;
    lineNumber: number;
    lineOffset: number;
}

/**
 * Get a snapshot of a token
 * @param file - file name/path
 * @param pos - character index in file
 */
export function fileLocate(file: string, pos: number): FileSnapshot {
    const lines = readFileSync(file).toString().split('\n');
    let cur = 0;
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++)
        if (1 + cur + lines[lineNumber].length > pos)
            return { line: lines[lineNumber], lineNumber: lineNumber + 1, lineOffset: pos - cur };
        else
            cur += 1 + lines[lineNumber].length;
    return null;
}

/**
 * Could be defined in error.ts or a js object
 */
interface CompileError extends Error {
    message: string;
    tokens: Array<lex.LexerToken>;
    dedupTokens?(): lex.LexerToken[];
}

/**
 * Make a pretty error string
 * @param errors - Array of errors to display
 * @returns - formatted string with escape sequence colors
 */
export function formatErrorPos(errors: CompileError[]): string {
    function ppToken(t: lex.LexerToken) {
        if (!t) return '';
        if (!t.file) return `${t.token}`;
        const loc = fileLocate(t.file, t.position),
            wsn = Math.min(Math.max(loc.lineOffset - t.token.length, 0), loc.line.length, loc.lineOffset),
            wss = loc.line.slice(0, wsn).split('').reduce((a, v) => a + (v === '\t' ? '\t' : ' '), '');
        return `\tat \x1B[1m${t.file}:${loc.lineNumber}:${loc.lineOffset}\x1B[0m\n\t\t${loc.line}\n`
            + `\t\t${wss}\x1B[1m\x1b[31m^${'~'.repeat(Math.max(t.token.length -1, 0))}\x1B[0m`;
    }
    return errors.map(e => {
        const toks = e.dedupTokens ? e.dedupTokens() : e.tokens;
        return `\x1B[1m${e instanceof Error ? 'Error: ' : ' '}${e.message}:\x1b[0m\n${
            toks.length > 35
                ? `${toks.slice(0, 15).map(ppToken).join('\n')
                    }\n\n...\n\n${toks.slice(-15).map(ppToken).join('\n')}`
                : toks.map(ppToken).join('\n')
        }\n${e.stack}`
    }).join('\n\n');
}


export function debugToken(token: lex.LexerToken) {
    return formatErrorPos([{ name: token.token, message: token.token, tokens: [token] }]);
}