#!/usr/bin/env node
import fs from 'fs';
import { Keypair } from '@solana/web3.js';
const kp = Keypair.generate();
const out = JSON.stringify(Array.from(kp.secretKey));
fs.writeFileSync('agents/openclaw-agent/demo-keypair.json', out);
console.log('WROTE agents/openclaw-agent/demo-keypair.json', kp.publicKey.toBase58());
