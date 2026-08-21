/**
 * Copy only the public site into dist/ so Wrangler does not upload
 * .git (the 123 MiB pack file that failed the first Cloudflare deploy).
 */
import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const dest = "dist";
const publicPaths = ["index.html", "_headers", "css", "js", "data", "assets"];

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });

for (const name of publicPaths) {
  await cp(name, join(dest, name), { recursive: true });
}

console.log(`Prepared ${dest}/ for Cloudflare (${publicPaths.join(", ")})`);
