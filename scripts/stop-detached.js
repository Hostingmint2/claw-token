#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import process from 'process';

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: stop-detached <pid|name>');
  process.exit(1);
}

const pidDir = path.join(process.cwd(), 'tmp', 'pids');
if (!fs.existsSync(pidDir)) {
  console.error('No detached processes found');
  process.exit(1);
}

// Try to find by name file
const files = fs.readdirSync(pidDir);
let target = null;
for (const f of files) {
  if (f.startsWith(arg) || f === `${arg}.json`) { target = f; break; }
}

let pid = null;
if (target) {
  const meta = JSON.parse(fs.readFileSync(path.join(pidDir, target), 'utf8'));
  pid = meta.pid;
} else if (/^\d+$/.test(arg)) {
  pid = Number(arg);
}

if (!pid) {
  console.error('Could not find PID for', arg);
  process.exit(1);
}

try {
  process.kill(pid, 'SIGTERM');
  console.log('Stopped pid', pid);
} catch (err) {
  console.error('Failed to stop pid', pid, String(err));
  process.exit(1);
}
// Remove any matching pid files
for (const f of files) {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(pidDir, f), 'utf8'));
    if (meta.pid === pid) fs.unlinkSync(path.join(pidDir, f));
  } catch (e) {}
}
process.exit(0);
