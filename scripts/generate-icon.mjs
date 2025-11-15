import pngToIco from "png-to-ico";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const buildDir = resolve(__dirname, "../build");

async function generateIco() {
  try {
    console.log("Generating icon.ico from icon.png...");

    const buf = await pngToIco(resolve(buildDir, "icon.png"));
    writeFileSync(resolve(buildDir, "icon.ico"), buf);

    console.log("✓ icon.ico generated successfully!");
  } catch (error) {
    console.error("✗ Failed to generate icon.ico:", error);
    process.exit(1);
  }
}

generateIco();
