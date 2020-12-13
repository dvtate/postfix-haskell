const { countReset } = require('console');
const fs = require('fs');

/**
 * Get a snapshot of a token
 * @param {string} file - file name/path
 * @param {number} pos - character index in file
 */
function fileLocate(file, pos) {
    const lines = fs.readFileSync(file).toString().split('\n');
    let cur = 0;
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++)
        if (1 + cur + lines[lineNumber].length > pos)
            return { line: lines[lineNumber], lineNumber, lineOffset: pos - cur };
        else
            cur += 1 + lines[lineNumber].length;
    return null;
}

/**
 * Make a pretty error string
 * @param {string} file - file name/path
 * @param {number} pos - character index in file
 */
function formatErrorPos(errors) {
    return errors.map(e =>
        `\x1B[1mError: ${e.message}:\x1b[0m\n${
            e.tokens.map(t => {
                const loc = fileLocate(t.file, t.position),
                    wsn = Math.min(Math.max(loc.lineOffset - t.token.length, 0), loc.line.length, loc.lineOffset),
                    wss = loc.line.slice(0, wsn).split('').reduce((a, v) => a + (v === '\t' ? '\t' : ' '), '');
                return `\tat \x1B[1m${t.file}:${loc.lineNumber}:${loc.lineOffset}\x1B[0m\n\t\t${loc.line}\n`
                    + `\t\t${wss}\x1B[1m\x1b[31m^${'~'.repeat(Math.max(t.token.length -1, 0))}\x1B[0m`;
            }).join('\n')
        }`).join('\n\n');
}

module.exports = { showFilePos : fileLocate, fileLocate, formatErrorPos };