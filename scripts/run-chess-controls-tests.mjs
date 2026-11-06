import { build } from "esbuild";

const output = await build({
  entryPoints: ["scripts/chess-controls.spec.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  write: false,
  logLevel: "warning"
});
const code = output.outputFiles[0]?.text;
if (!code) throw new Error("Chess test bundle could not be built.");
await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
