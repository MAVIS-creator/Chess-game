import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = path.join(root, "node_modules", "stockfish");
const packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
const expectedVersion = "19.0.1";

if (packageJson.version !== expectedVersion) {
  throw new Error(`Expected stockfish@${expectedVersion}, found ${packageJson.version}.`);
}

const sourceDir = path.join(packageRoot, "bin");
const destinationDir = path.join(root, "public", "stockfish");
const files = ["stockfish-19-lite-single.js", "stockfish-19-lite-single.wasm"];

await mkdir(destinationDir, { recursive: true });

for (const file of files) {
  await copyFile(path.join(sourceDir, file), path.join(destinationDir, file));
}

await copyFile(path.join(packageRoot, "Copying.txt"), path.join(destinationDir, "COPYING.txt"));
await writeFile(
  path.join(destinationDir, "SOURCE.json"),
  `${JSON.stringify(
    {
      engine: "Stockfish.js",
      stockfishVersion: "19",
      packageVersion: expectedVersion,
      variant: "lite-single",
      package: `stockfish@${expectedVersion}`,
      upstream: "https://github.com/nmrugg/stockfish.js/tree/v19.0.1",
      license: "GPL-3.0"
    },
    null,
    2
  )}\n`,
  "utf8"
);

for (const oldFile of ["stockfish-18-lite-single.js", "stockfish-18-lite-single.wasm"]) {
  await rm(path.join(destinationDir, oldFile), { force: true });
}

console.log("Stockfish 19 lite-single fallback is ready in public/stockfish.");
