#!/usr/bin/env node
import crypto from 'crypto';
import fs from 'fs';

const secret = process.env.TRACKING_HMAC_SECRET || '';
if (!secret) {
  console.error('TRACKING_HMAC_SECRET env required');
  process.exit(1);
}

const payload = process.argv[2] || fs.readFileSync(0, 'utf8');
const h = crypto.createHmac('sha256', secret).update(payload).digest('hex');
console.log(h);
