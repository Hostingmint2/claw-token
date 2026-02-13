#!/usr/bin/env node
import http from 'http';
const url = process.argv[2] || 'http://127.0.0.1:9800/health';
const req = http.get(url, (res) => {
  let d = '';
  res.on('data', (c) => d += c);
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    console.log(d);
    process.exit(res.statusCode === 200 ? 0 : 2);
  });
});
req.on('error', (e) => { console.error('ERR', e.message); process.exit(2); });
req.setTimeout(2000, () => { console.error('ERR: timeout'); process.exit(2); });
