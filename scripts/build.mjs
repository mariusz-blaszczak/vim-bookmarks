import * as esbuild from "esbuild";
import { mkdir, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";

const TARGETS = ["chrome", "firefox"];
const watch = process.argv.includes("--watch");

const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));

function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] =
      v && typeof v === "object" && !Array.isArray(v) && typeof a[k] === "object"
        ? deepMerge(a[k], v)
        : v;
  }
  return out;
}

async function writeStatic(target, outdir) {
  const pkg = await readJson("package.json");
  const manifest = deepMerge(
    await readJson("manifests/base.json"),
    await readJson(`manifests/${target}.json`),
  );
  manifest.version = pkg.version;
  await writeFile(join(outdir, "manifest.json"), JSON.stringify(manifest, null, 2));
  await copyFile("src/ui/ui.html", join(outdir, "ui.html"));
}

for (const target of TARGETS) {
  const outdir = join("dist", target);
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  await writeStatic(target, outdir);

  const options = {
    entryPoints: {
      background: "src/background/index.ts",
      content: "src/content/index.ts",
      ui: "src/ui/page.ts",
    },
    outdir,
    bundle: true,
    format: "iife",
    target: target === "chrome" ? "chrome116" : "firefox142",
    loader: { ".css": "text" },
    sourcemap: watch ? "inline" : false,
    define: { __TARGET__: JSON.stringify(target) },
    logLevel: "info",
  };

  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
  } else {
    await esbuild.build(options);
  }
}
