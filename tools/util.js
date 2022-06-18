"use strict";
exports.__esModule = true;
exports.uid = exports.formatErrorPos = exports.fileLocate = void 0;
var fs_1 = require("fs");
/**
 * Get a snapshot of a token
 * @param {string} file - file name/path
 * @param {number} pos - character index in file
 */
function fileLocate(file, pos) {
    var lines = (0, fs_1.readFileSync)(file).toString().split('\n');
    var cur = 0;
    for (var lineNumber = 0; lineNumber < lines.length; lineNumber++)
        if (1 + cur + lines[lineNumber].length > pos)
            return { line: lines[lineNumber], lineNumber: lineNumber + 1, lineOffset: pos - cur };
        else
            cur += 1 + lines[lineNumber].length;
    return null;
}
exports.fileLocate = fileLocate;
/**
 * Make a pretty error string
 * @param errors - Array of errors to display
 * @returns - formatted string with escape sequence colors
 */
function formatErrorPos(errors) {
    function ppToken(t) {
        if (!t)
            return '';
        if (!t.file)
            return "".concat(t.token);
        var loc = fileLocate(t.file, t.position), wsn = Math.min(Math.max(loc.lineOffset - t.token.length, 0), loc.line.length, loc.lineOffset), wss = loc.line.slice(0, wsn).split('').reduce(function (a, v) { return a + (v === '\t' ? '\t' : ' '); }, '');
        return "\tat \u001B[1m".concat(t.file, ":").concat(loc.lineNumber, ":").concat(loc.lineOffset, "\u001B[0m\n\t\t").concat(loc.line, "\n")
            + "\t\t".concat(wss, "\u001B[1m\u001B[31m^").concat('~'.repeat(Math.max(t.token.length - 1, 0)), "\u001B[0m");
    }
    return errors.map(function (e) {
        return "\u001B[1m".concat(e instanceof Error ? 'Error: ' : ' ').concat(e.message, ":\u001B[0m\n").concat(e.tokens.length > 35
            ? "".concat(e.tokens.slice(0, 15).map(ppToken).join('\n'), "\n\n...\n\n").concat(e.tokens.slice(-15).map(ppToken).join('\n'))
            : e.tokens.map(ppToken).join('\n'));
    }).join('\n\n');
}
exports.formatErrorPos = formatErrorPos;
// Used by function uid
var nUid = 0;
/**
 * Genereate a globally unique identifier string
 * @returns unique string identifier
 */
function uid() {
    function encodeNum(n) {
        var enc = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ~!@#$%^&*()_-+=|:;.>,<?/";
        var base = enc.length;
        var ret = '';
        do {
            ret += enc[n % base];
            n /= base;
        } while (n >= 1);
        return ret;
    }
    return encodeNum(nUid++);
}
exports.uid = uid;
