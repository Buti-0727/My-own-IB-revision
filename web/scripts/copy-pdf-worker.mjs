import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(projectRoot, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const publicDirectory = resolve(projectRoot, "public");
const destination = resolve(publicDirectory, "pdf.worker.min.mjs");

mkdirSync(publicDirectory, { recursive: true });
copyFileSync(source, destination);
