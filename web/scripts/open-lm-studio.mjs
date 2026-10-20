import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const failureMessage = "Could not open LM Studio automatically. Open it manually if you want local AI feedback.";

export function openLMStudio() {
  if (process.platform !== "darwin") {
    console.warn("Automatic LM Studio launch is available on macOS only. Open it manually if needed.");
    return;
  }

  try {
    const result = spawnSync("open", ["-a", "LM Studio"], { stdio: "ignore" });
    if (result.error || result.status !== 0) console.warn(failureMessage);
  } catch {
    console.warn(failureMessage);
  }
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) openLMStudio();
