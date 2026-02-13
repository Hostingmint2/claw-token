import fs from "node:fs";
import path from "node:path";

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFirstExisting(candidates, destPath) {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      fs.copyFileSync(candidate, destPath);
      return { from: candidate, to: destPath };
    }
  }
  throw new Error(
    `Could not find any candidate files to copy. Tried:\n${candidates
      .map((c) => `- ${c}`)
      .join("\n")}`,
  );
}

function main() {
  const root = path.resolve(process.cwd());
  const vendorDir = path.join(root, "site", "vendor");
  ensureDir(vendorDir);

  const naclDest = path.join(vendorDir, "nacl-fast.min.js");
  const naclUtilDest = path.join(vendorDir, "nacl-util.min.js");

  const naclCandidates = [
    path.join(root, "node_modules", "tweetnacl", "nacl-fast.min.js"),
    path.join(root, "node_modules", "tweetnacl", "nacl-fast.js"),
    path.join(root, "node_modules", "tweetnacl", "nacl.min.js"),
    path.join(root, "node_modules", "tweetnacl", "nacl.js"),
  ];

  const naclUtilCandidates = [
    path.join(root, "node_modules", "tweetnacl-util", "nacl-util.min.js"),
    path.join(root, "node_modules", "tweetnacl-util", "nacl-util.js"),
  ];

  const copied1 = copyFirstExisting(naclCandidates, naclDest);
  const copied2 = copyFirstExisting(naclUtilCandidates, naclUtilDest);

  console.log(
    JSON.stringify(
      {
        ok: true,
        vendorDir: path.relative(root, vendorDir),
        copied: [
          { from: path.relative(root, copied1.from), to: path.relative(root, copied1.to) },
          { from: path.relative(root, copied2.from), to: path.relative(root, copied2.to) },
        ],
        next: "Serve site/ with vendor/ files; chat.html will load local crypto libs.",
      },
      null,
      2,
    ),
  );
}

main();
