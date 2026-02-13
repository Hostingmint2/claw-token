#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const siteDir = path.join(process.cwd(), 'site');
const releasesDir = path.join(siteDir, 'releases');
try { fs.mkdirSync(releasesDir, { recursive: true }); } catch (e) {}
const tag = `claw-pwa-${Date.now()}`;
const outDir = path.join(releasesDir, tag);

function copyRecursive(src, dest) {
  // Prevent copying the releases output back into itself (avoid infinite recursion)
  if (path.resolve(src) === path.resolve(releasesDir)) return;

  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    try { fs.mkdirSync(dest, { recursive: true }); } catch (e) {}
    for (const f of fs.readdirSync(src)) copyRecursive(path.join(src, f), path.join(dest, f));
  } else {
    fs.copyFileSync(src, dest);
  }
}

copyRecursive(siteDir, outDir);
fs.writeFileSync(path.join(releasesDir, 'latest.json'), JSON.stringify({ tag, path: `releases/${tag}` }, null, 2));
console.log('PWA release created at', outDir);
