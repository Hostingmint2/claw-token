import fs from "node:fs";
import path from "node:path";

const storePath = process.env.TELEGRAM_STORE?.trim() || "./server/telegram-store.json";

export function loadTelegramStore() {
  const absolute = path.resolve(storePath);
  if (!fs.existsSync(absolute)) {
    return { users: {}, codes: {} };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(absolute, "utf8"));
    const users = raw?.users && typeof raw.users === "object" ? raw.users : {};
    const codes = raw?.codes && typeof raw.codes === "object" ? raw.codes : {};
    return { users, codes };
  } catch {
    return { users: {}, codes: {} };
  }
}

export function saveTelegramStore(store) {
  const absolute = path.resolve(storePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, JSON.stringify(store, null, 2));
}
