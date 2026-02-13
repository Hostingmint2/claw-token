/*
  ClawChat Double Ratchet (DR) - browser-only, relay-agnostic.
  This is a pragmatic online-session ratchet, not a full Signal implementation.

  Design goals:
  - Forward secrecy within an online session.
  - MITM resistance against a malicious relay by binding the ratchet to a pinned X25519 identity key
    (the same identity key used for NaCl box). The relay cannot compute baseSecret.
  - No external dependencies beyond tweetnacl + WebCrypto.

  Limits:
  - No skipped-message-key storage (limited out-of-order support).
  - No X3DH / prekeys / async offline establishment.
  - Not audited. Do not claim Signal-equivalent security.
*/

(function () {
    // X3DH Prekey Bundle (Signal-style async session establishment)
    function generatePrekeyBundle() {
      requireNacl();
      const identityKey = window.nacl.box.keyPair();
      const signedPrekey = window.nacl.box.keyPair();
      const oneTimePrekey = window.nacl.box.keyPair();
      return {
        identityKey,
        signedPrekey,
        oneTimePrekey,
        bundle: {
          identity: window.nacl.util.encodeBase64(identityKey.publicKey),
          signedPrekey: window.nacl.util.encodeBase64(signedPrekey.publicKey),
          oneTimePrekey: window.nacl.util.encodeBase64(oneTimePrekey.publicKey),
        },
      };
    }

    // Persistent session storage (localStorage)
    function saveSession(peerId, session) {
      localStorage.setItem(`clawchat.ratchet.${peerId}`, JSON.stringify(session));
    }
    function loadSession(peerId) {
      const raw = localStorage.getItem(`clawchat.ratchet.${peerId}`);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return null; }
    }

    // Skipped message key storage for out-of-order support
    function createSkippedKeysStore() {
      return {};
    }
    function storeSkippedKey(store, peerId, n, key) {
      store[`${peerId}:${n}`] = key;
    }
    function getSkippedKey(store, peerId, n) {
      return store[`${peerId}:${n}`] || null;
    }

  const INFO = new TextEncoder().encode("ClawDR-v1");
  const ZERO_SALT = new Uint8Array(32);

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function bytesToB64(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function concatBytes(a, b) {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }

  async function hmacSha256(keyBytes, dataBytes) {
    if (!crypto?.subtle?.importKey || !crypto?.subtle?.sign) {
      throw new Error("WebCrypto unavailable");
    }
    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, dataBytes);
    return new Uint8Array(sig);
  }

  // HKDF (RFC 5869) with SHA-256
  async function hkdfExtract(salt, ikm) {
    return hmacSha256(salt, ikm);
  }

  async function hkdfExpand(prk, info, length) {
    const blocks = [];
    let prev = new Uint8Array(0);
    let counter = 1;

    while (blocks.reduce((n, b) => n + b.length, 0) < length) {
      const input = concatBytes(concatBytes(prev, info), new Uint8Array([counter]));
      // eslint-disable-next-line no-await-in-loop
      prev = await hmacSha256(prk, input);
      blocks.push(prev);
      counter += 1;
      if (counter > 255) throw new Error("HKDF counter overflow");
    }

    const out = new Uint8Array(length);
    let offset = 0;
    for (const b of blocks) {
      const take = Math.min(b.length, length - offset);
      out.set(b.slice(0, take), offset);
      offset += take;
      if (offset >= length) break;
    }
    return out;
  }

  async function hkdf(salt, ikm, info, length) {
    const prk = await hkdfExtract(salt, ikm);
    return hkdfExpand(prk, info, length);
  }

  async function kdfRoot(rootKey, dhShared) {
    // Derive new root + two chain keys
    const out = await hkdf(rootKey, dhShared, INFO, 96);
    return {
      rootKey: out.slice(0, 32),
      ck1: out.slice(32, 64),
      ck2: out.slice(64, 96),
    };
  }

  async function kdfInit(baseSecret, dhShared) {
    // Bind to pinned identity key to resist relay MITM.
    const ikm = concatBytes(baseSecret, dhShared);
    const out = await hkdf(ZERO_SALT, ikm, INFO, 96);
    return {
      rootKey: out.slice(0, 32),
      ck1: out.slice(32, 64),
      ck2: out.slice(64, 96),
    };
  }

  async function kdfChain(chainKey) {
    // Derive message key and next chain key
    const mk = await hmacSha256(chainKey, new Uint8Array([1]));
    const ck = await hmacSha256(chainKey, new Uint8Array([2]));
    return { messageKey: mk.slice(0, 32), chainKey: ck.slice(0, 32) };
  }

  function requireNacl() {
    if (!window.nacl?.box?.keyPair || !window.nacl?.box?.before || !window.nacl?.secretbox) {
      throw new Error("NaCl not loaded");
    }
    if (!window.nacl?.util?.decodeBase64 || !window.nacl?.util?.encodeBase64) {
      throw new Error("nacl-util not loaded");
    }
  }

  function createSession(params) {
    requireNacl();

    return {
      v: "dr1",
      myId: params.myId,
      peerId: params.peerId,
      role: params.role, // "init" | "resp"
      baseSecretB64: params.baseSecretB64, // derived from pinned identity keys
      rootKeyB64: null,
      ckSendB64: null,
      ckRecvB64: null,
      dhSelf: window.nacl.box.keyPair(),
      dhRemoteB64: null,
      ns: 0,
      nr: 0,
      ready: false,
    };
  }

  function baseSecretFromPinnedIdentity(myIdentitySecretKeyBytes, peerPinnedIdentityPubKeyBytes) {
    requireNacl();
    const baseSecret = window.nacl.box.before(peerPinnedIdentityPubKeyBytes, myIdentitySecretKeyBytes);
    return bytesToB64(baseSecret);
  }

  async function initAsInitiator(session, peerDhPubB64) {
    requireNacl();
    const baseSecret = b64ToBytes(session.baseSecretB64);
    const peerDhPub = window.nacl.util.decodeBase64(peerDhPubB64);
    const dhShared = window.nacl.box.before(peerDhPub, session.dhSelf.secretKey);
    const derived = await kdfInit(baseSecret, dhShared);

    // Deterministic direction assignment (avoid both sides using same send key)
    const iAmLower = String(session.myId) < String(session.peerId);
    const ckSend = iAmLower ? derived.ck1 : derived.ck2;
    const ckRecv = iAmLower ? derived.ck2 : derived.ck1;

    session.rootKeyB64 = bytesToB64(derived.rootKey);
    session.ckSendB64 = bytesToB64(ckSend);
    session.ckRecvB64 = bytesToB64(ckRecv);
    session.dhRemoteB64 = peerDhPubB64;
    session.ns = 0;
    session.nr = 0;
    session.ready = true;
  }

  async function initAsResponder(session, peerDhPubB64) {
    // Same as initiator: direction decided by IDs only.
    return initAsInitiator(session, peerDhPubB64);
  }

  async function dhRatchet(session, newPeerDhPubB64) {
    requireNacl();

    const rootKey = b64ToBytes(session.rootKeyB64);
    const peerDhPub = window.nacl.util.decodeBase64(newPeerDhPubB64);

    // Step 1: update receiving chain based on DH(self, remote)
    const dh1 = window.nacl.box.before(peerDhPub, session.dhSelf.secretKey);
    const derived1 = await kdfRoot(rootKey, dh1);

    // Step 2: rotate our DH key
    session.dhSelf = window.nacl.box.keyPair();

    // Step 3: update sending chain based on DH(selfNew, remote)
    const dh2 = window.nacl.box.before(peerDhPub, session.dhSelf.secretKey);
    const derived2 = await kdfRoot(derived1.rootKey, dh2);

    // Deterministic direction assignment still applies
    const iAmLower = String(session.myId) < String(session.peerId);
    const ckSend = iAmLower ? derived2.ck1 : derived2.ck2;
    const ckRecv = iAmLower ? derived1.ck2 : derived1.ck1;

    session.rootKeyB64 = bytesToB64(derived2.rootKey);
    session.ckSendB64 = bytesToB64(ckSend);
    session.ckRecvB64 = bytesToB64(ckRecv);
    session.dhRemoteB64 = newPeerDhPubB64;
    session.ns = 0;
    session.nr = 0;
  }

  async function encryptForPeer(session, plaintextBytes) {
    if (!session.ready) throw new Error("ratchet not ready");

    const ckSend = b64ToBytes(session.ckSendB64);
    const step = await kdfChain(ckSend);
    session.ckSendB64 = bytesToB64(step.chainKey);

    const nonce = window.nacl.randomBytes(window.nacl.secretbox.nonceLength);
    const ct = window.nacl.secretbox(plaintextBytes, nonce, step.messageKey);

    const header = {
      v: "dr1",
      dh: window.nacl.util.encodeBase64(session.dhSelf.publicKey),
      n: session.ns,
    };
    session.ns += 1;

    return {
      header,
      nonceB64: window.nacl.util.encodeBase64(nonce),
      ciphertextB64: window.nacl.util.encodeBase64(ct),
    };
  }

  async function decryptFromPeer(session, header, nonceB64, ciphertextB64) {
    if (!session.ready) throw new Error("ratchet not ready");
    if (!header || header.v !== "dr1") throw new Error("bad header");

    const peerDh = String(header.dh || "");
    const n = Number(header.n);
    if (!peerDh || !Number.isFinite(n) || n < 0) throw new Error("bad header");

    if (session.dhRemoteB64 && peerDh !== session.dhRemoteB64) {
      await dhRatchet(session, peerDh);
    }

    const MAX_SKIP = 50;
    if (n > session.nr + MAX_SKIP) throw new Error("too far out-of-order");

    let ckRecv = b64ToBytes(session.ckRecvB64);
    while (session.nr < n) {
      // eslint-disable-next-line no-await-in-loop
      const stepSkip = await kdfChain(ckRecv);
      ckRecv = stepSkip.chainKey;
      session.nr += 1;
    }

    const step = await kdfChain(ckRecv);
    session.ckRecvB64 = bytesToB64(step.chainKey);
    session.nr += 1;

    const nonce = window.nacl.util.decodeBase64(nonceB64);
    const ct = window.nacl.util.decodeBase64(ciphertextB64);
    const opened = window.nacl.secretbox.open(ct, nonce, step.messageKey);
    if (!opened) throw new Error("failed to decrypt");
    return opened;
  }

  window.ClawRatchet = {
    createSession,
    baseSecretFromPinnedIdentity,
    initAsInitiator,
    initAsResponder,
    encryptForPeer,
    decryptFromPeer,
    generatePrekeyBundle,
    saveSession,
    loadSession,
    createSkippedKeysStore,
    storeSkippedKey,
    getSkippedKey,
    // X3DH session setup
    async x3dhSessionInit(myBundle, peerBundle) {
      requireNacl();
      // Signal-style: DH(identity, signedPrekey), DH(identity, oneTimePrekey), DH(signedPrekey, identity), etc.
      const dh1 = window.nacl.box.before(
        window.nacl.util.decodeBase64(peerBundle.signedPrekey),
        myBundle.identityKey.secretKey,
      );
      const dh2 = window.nacl.box.before(
        window.nacl.util.decodeBase64(peerBundle.oneTimePrekey),
        myBundle.identityKey.secretKey,
      );
      const dh3 = window.nacl.box.before(
        window.nacl.util.decodeBase64(peerBundle.identity),
        myBundle.signedPrekey.secretKey,
      );
      // Combine secrets
      const ikm = concatBytes(concatBytes(dh1, dh2), dh3);
      const out = await hkdf(ZERO_SALT, ikm, INFO, 96);
      return {
        rootKey: out.slice(0, 32),
        ck1: out.slice(32, 64),
        ck2: out.slice(64, 96),
      };
    },
  };
})();
