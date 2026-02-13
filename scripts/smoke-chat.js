#!/usr/bin/env node
import WebSocket from 'ws';
import nacl from 'tweetnacl';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const CHAT_URL = process.env.CHAT_URL || 'ws://127.0.0.1:8791';
const SECRET = process.env.ACCESS_JWT_SECRET || 'demo-secret-long-and-secure-0123456789';

function makeToken(sub, tier = 'gold') {
  return jwt.sign({ sub, tier, scope: 'chat', aud: 'clawchat' }, SECRET, { expiresIn: '1h' });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function run() {
  console.log('Smoke chat test ->', CHAT_URL);

  // create two keypairs (sender/receiver) and tokens
  const aliceK = nacl.box.keyPair();
  const bobK = nacl.box.keyPair();
  const alice = 'Alice' + Date.now();
  const bob = 'Bob' + Date.now();
  const aliceToken = makeToken(alice);
  const bobToken = makeToken(bob);

  // open two WS connections
  const a = new WebSocket(CHAT_URL);
  const b = new WebSocket(CHAT_URL);

  const awaitOpen = (ws) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('ws open timeout')), 5000);
    ws.once('open', () => { clearTimeout(t); res(); });
    ws.once('error', (err) => rej(err));
  });

  await Promise.all([awaitOpen(a), awaitOpen(b)]);

  // auth both
  a.send(JSON.stringify({ type: 'auth', token: aliceToken, room: 'smoke-room' }));
  b.send(JSON.stringify({ type: 'auth', token: bobToken, room: 'smoke-room' }));

  // wait for welcome
  await Promise.all([
    new Promise((res) => a.once('message', (m) => { console.log('A msg1', m.toString()); res(); })),
    new Promise((res) => b.once('message', (m) => { console.log('B msg1', m.toString()); res(); })),
  ]);

  // send hello pubkeys (base64 32 bytes)
  const aPub = Buffer.from(aliceK.publicKey).toString('base64');
  const bPub = Buffer.from(bobK.publicKey).toString('base64');
  a.send(JSON.stringify({ type: 'hello', pubKey: aPub }));
  b.send(JSON.stringify({ type: 'hello', pubKey: bPub }));

  // wait for peer announcements
  await Promise.all([
    new Promise((res) => a.once('message', (m) => { console.log('A msg2', m.toString()); res(); })),
    new Promise((res) => b.once('message', (m) => { console.log('B msg2', m.toString()); res(); })),
  ]);

  // Alice encrypts a short message to Bob using nacl.box
  const plaintext = new TextEncoder().encode('hello bob — this is E2EE smoke');
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const cipher = nacl.box(plaintext, nonce, bobK.publicKey, aliceK.secretKey);
  const payload = {
    type: 'msg',
    to: bob,
    ciphertext: Buffer.from(cipher).toString('base64'),
    nonce: Buffer.from(nonce).toString('base64'),
    msgId: 'smoke-1',
  };

  // Bob listens and will decrypt
  const received = new Promise((res) => {
    b.on('message', (m) => {
      try {
        const obj = JSON.parse(String(m));
        if (obj.type === 'msg' && obj.from && obj.ciphertext) {
          const ct = Buffer.from(obj.ciphertext, 'base64');
          const n = Buffer.from(obj.nonce, 'base64');
          const plain = nacl.box.open(ct, n, Buffer.from(obj.fromPubKey, 'base64'), bobK.secretKey);
          if (!plain) throw new Error('decryption failed');
          console.log('Bob decrypted:', new TextDecoder().decode(plain));
          res(true);
        }
      } catch (err) {
        // ignore
      }
    });
  });

  // Alice also listens for delivery confirmation
  a.on('message', (m) => { console.log('A got:', String(m)); });

  // send the encrypted message
  a.send(JSON.stringify(payload));

  const ok = await Promise.race([received, sleep(5000).then(() => false)]);
  if (!ok) throw new Error('smoke chat failed');
  console.log('E2EE smoke succeeded');

  a.close(); b.close();
}

run().catch((err) => { console.error('smoke-chat failed:', err.message || err); process.exit(1); });
