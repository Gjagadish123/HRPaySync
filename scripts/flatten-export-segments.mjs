// Post-export fix for GitHub Pages (Next.js 16.4 static export).
// The browser requests link-prefetch files with flat names, e.g. board/__next.board.__PAGE__.txt
// (convertSegmentPathToStaticExportFilename joins the segment path with dots), but the exporter writes them
// nested, e.g. board/__next.board/__PAGE__.txt, so every prefetch 404s. This copies each nested file to the
// flat name next to it. Originals are kept. Remove once Next.js writes the flat names itself.
import { copyFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const out = process.argv[2] ?? "out";
let copied = 0;

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) continue;
    if (name.startsWith("__next.")) {
      for (const file of filesUnder(p)) {
        const flat = relative(dir, file).split(sep).join(".");
        copyFileSync(file, join(dir, flat));
        copied++;
      }
    } else {
      walk(p);
    }
  }
}

walk(out);
console.log(`flatten-export-segments: wrote ${copied} flat prefetch file(s) in ${out}`);
