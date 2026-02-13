#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

let args = process.argv.slice(2);
if (!args.length) {
  console.error('Usage: run-detached [--wait=ms] <cmd> [args...]');
  process.exit(1);
}

// support optional --wait=ms or --no-check
let waitMs = Number(process.env.RUN_DETACHED_WAIT_MS || 2000);
let noCheck = false;
for (const a of args) {
  if (a.startsWith('--wait=')) {
    waitMs = Number(a.split('=')[1]) || waitMs; // override
    args = args.filter((x) => x !== a);
  }
  if (a === '--no-check') {
    noCheck = true;
    args = args.filter((x) => x !== a);
  }
}

const cmd = args[0];
const cmdArgs = args.slice(1);

const logDir = path.join(process.cwd(), 'tmp', 'logs');
try { fs.mkdirSync(logDir, { recursive: true }); } catch {}
const pidDir = path.join(process.cwd(), 'tmp', 'pids');
try { fs.mkdirSync(pidDir, { recursive: true }); } catch {}

// create a log file for stdout/stderr
const nameBase = (cmdArgs[0] || cmd).replace(/[^a-z0-9\-_.]/gi, '-');
const outPath = path.join(logDir, `${nameBase}-${Date.now()}.log`);
const outFd = fs.openSync(outPath, 'a');

const child = spawn(cmd, cmdArgs, {
  detached: true,
  stdio: ['ignore', outFd, outFd],
  windowsHide: true,
});

child.unref();

const name = `${nameBase}-${child.pid}`;
const meta = {
  pid: child.pid,
  cmd,
  args: cmdArgs,
  startedAt: new Date().toISOString(),
  log: outPath,
};
fs.writeFileSync(path.join(pidDir, `${name}.json`), JSON.stringify(meta, null, 2));

// If noCheck is set, return immediately (legacy behavior)
if (noCheck || waitMs <= 0) {
  console.log(JSON.stringify({ ok: true, name, pid: child.pid, meta }));
  process.exit(0);
}

// Wait a short time then check if process is still running; if it exited, surface tail of log and remove pid file
setTimeout(() => {
  try {
    process.kill(child.pid, 0); // check if alive
    console.log(JSON.stringify({ ok: true, name, pid: child.pid, meta }));
    process.exit(0);
  } catch (err) {
    // process exited quickly — show tail of log and remove pid file
    try {
      const tailContent = fs.readFileSync(outPath, 'utf8');
      const lines = tailContent.split(/\r?\n/).filter(Boolean);
      const tail = lines.slice(-100).join('\n');
      console.error('Process exited shortly after start. Log tail:\n' + tail);
    } catch (e) {
      console.error('Process exited and log could not be read');
    }
    try { fs.unlinkSync(path.join(pidDir, `${name}.json`)); } catch (e) {}
    process.exit(1);
  }
}, waitMs);
