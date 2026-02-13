#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const latest = JSON.parse(fs.readFileSync(path.join('site', 'releases', 'latest.json'), 'utf8'));
const relPath = path.join('site', latest.path);
const dest = path.join('site', 'releases', `${latest.tag}.zip`);

console.log('Zipping', relPath, '->', dest);
// Use PowerShell Compress-Archive on Windows
const psCmd = `Compress-Archive -Path \"${relPath}\\*\" -DestinationPath \"${dest}\" -Force`;
const r = spawnSync('powershell', ['-NoProfile', '-Command', psCmd], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status);
console.log('Zip created:', dest);
