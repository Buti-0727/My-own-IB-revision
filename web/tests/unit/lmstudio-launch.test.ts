import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

const webDirectory = process.cwd();
const temporaryDirectories: string[] = [];

function runWithFakeLMStudio(script: "dev" | "start", exitCode: number) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "ib-revision-lm-studio-"));
  temporaryDirectories.push(temporaryDirectory);

  const binDirectory = join(temporaryDirectory, "bin");
  const markerPath = join(temporaryDirectory, "open-arguments.txt");
  mkdirSync(binDirectory);
  writeFileSync(
    join(binDirectory, "open"),
    `#!/bin/sh\nprintf '%s\\n' "$@" > "$LM_STUDIO_TEST_MARKER"\nexit ${exitCode}\n`,
  );
  chmodSync(join(binDirectory, "open"), 0o755);

  const output = execFileSync("npm", ["run", script, "--", "--help"], {
    cwd: webDirectory,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}`,
      LM_STUDIO_TEST_MARKER: markerPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  return { markerPath, output };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe.skipIf(process.platform !== "darwin")("LM Studio startup", () => {
  it("opens the native app before starting the development server", () => {
    const { markerPath } = runWithFakeLMStudio("dev", 0);

    expect(existsSync(markerPath)).toBe(true);
    expect(readFileSync(markerPath, "utf8")).toBe("-a\nLM Studio\n");
  });

  it("opens the native app before starting the production server", () => {
    const { markerPath } = runWithFakeLMStudio("start", 0);

    expect(existsSync(markerPath)).toBe(true);
    expect(readFileSync(markerPath, "utf8")).toBe("-a\nLM Studio\n");
  });

  it("keeps development-server startup working when LM Studio cannot open", () => {
    const { output, markerPath } = runWithFakeLMStudio("dev", 1);

    expect(existsSync(markerPath)).toBe(true);
    expect(readFileSync(markerPath, "utf8")).toBe("-a\nLM Studio\n");
    expect(output).toContain("next dev");
  });
});
