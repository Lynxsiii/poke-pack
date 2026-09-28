/**
 * Copy only the public site into dist/ so Wrangler does not upload
 * .git (the 123 MiB pack file that failed the first Cloudflare deploy).
 *
 * Cloudflare Workers static assets take at most 20,000 files per deploy.
 * With the Sword & Shield era the public tree passed 24,000, so the small
 * card thumbnails (assets/cards/<set>/<n>-sm.webp, one per scan) stay out
 * of the upload: worker/index.js answers a "-sm.webp" request with the full
 * scan instead, so nothing in data/ or js/ has to change. They are still
 * in the repo for the day the scans move to their own bucket.
 */
import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const dest = "dist";
const publicPaths = ["index.html", "_headers", "css", "js", "data", "assets"];
const SMALL_SCAN = /(^|[\\/])assets[\\/]cards[\\/].*-sm\.webp$/;
const MAX_FILES = 20000;

let copied = 0;
let skipped = 0;

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });

for (const name of publicPaths) {
  await cp(name, join(dest, name), {
    recursive: true,
    filter: (src, _dst) => {
      if (SMALL_SCAN.test(src)) {
        skipped += 1;
        return false;
      }
      return true;
    },
  });
}

// Count what will be uploaded, so the build fails here with a clear message
// rather than in Cloudflare's uploader.
const { readdir } = await import("node:fs/promises");
async function count(dir) {
  let n = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) n += await count(join(dir, entry.name));
    else n += 1;
  }
  return n;
}
copied = await count(dest);

console.log(
  `Prepared ${dest}/ for Cloudflare (${publicPaths.join(", ")}): ${copied} files, ${skipped} small thumbnails left out`,
);
if (copied > MAX_FILES) {
  console.error(`${copied} files is over Cloudflare's ${MAX_FILES}-file limit; the deploy would fail.`);
  process.exit(1);
}
