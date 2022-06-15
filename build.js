import { readFile, writeFile } from "fs/promises";

console.log("Building WAT runtime JS...");

const rtWat = await readFile("src/lib/rt.wat", "utf8");
const noRtWat = await readFile("src/lib/no_rt.wat", "utf8");
const watRuntime = `
export default ${JSON.stringify(rtWat)};
export const noRuntime = ${JSON.stringify(noRtWat)};
`;

/**
 * Write the generated WASM JS runtime.
 */
await writeFile('src/generated/wat-runtime.ts', watRuntime);