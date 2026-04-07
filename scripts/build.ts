import { rmSync } from "fs";
import { BuildOutput } from "bun";

type BuildMode = "dev" | "prod" | "playground";

const mode = resolveMode(process.argv);

// Step 1 (all modes): Build the library bundle
const libraryBuild = await Bun.build({
  entrypoints: ["src/index.ts"],
  outdir: "dist",
  target: "browser",
  format: "esm",
  sourcemap: mode === "dev" ? "external" : "none",
  splitting: false,
  external: ["react", "react-dom", "react/jsx-runtime"],
  ...(mode !== "dev" && { minify: true }),
});

assertBuildSuccess(libraryBuild, "Library");

for (const output of libraryBuild.outputs) {
  console.log(`  ${output.path} (${(output.size / 1024).toFixed(1)} KB)`);
}

// Step 2 (prod only): Bundle type declarations into a single dist/index.d.ts
if (mode === "prod") {
  // Remove stale artifacts from prior builds before writing the declaration bundle.
  const staleArtifacts = [
    "dist/comments",
    "dist/component",
    "dist/document",
    "dist/editor",
    "dist/index.d.ts",
    "dist/index.js.map",
    "dist/markdown",
  ];
  for (const path of staleArtifacts) {
    rmSync(path, { recursive: true, force: true });
  }

  console.log("\nGenerating type declarations...");

  const dts = Bun.spawnSync(
    [
      "dts-bundle-generator",
      "--project",
      "tsconfig.json",
      "--out-file",
      "dist/index.d.ts",
      "--no-banner",
      "--no-check",
      "--export-referenced-types",
      "false",
      "src/index.ts",
    ],
    {
      stdio: ["inherit", "inherit", "inherit"],
    },
  );

  if (dts.exitCode !== 0) {
    throw new Error("Type declaration generation failed.");
  }

  console.log("Package build complete. Ready to publish.");
}

// Step 3 (dev + playground): Build the playground app
if (mode !== "prod") {
  rmSync("dist/playground", { recursive: true, force: true });

  const playgroundBuild = await Bun.build({
    entrypoints: ["playground/index.html"],
    outdir: "dist/playground",
    target: "browser",
    sourcemap: "none",
    ...(mode === "playground" && { minify: true }),
  });

  assertBuildSuccess(playgroundBuild, "Playground");

  console.log(
    `\nBuilt ${libraryBuild.outputs.length} library outputs and ${playgroundBuild.outputs.length} playground outputs.`,
  );
}

function resolveMode(argv: string[]): BuildMode {
  if (argv.includes("--prod")) return "prod";
  if (argv.includes("--playground")) return "playground";
  return "dev";
}

function assertBuildSuccess(build: BuildOutput, name: string) {
  if (!build.success) {
    build.logs.forEach(console.error);
    throw new Error(`${name} build failed.`);
  }
}
