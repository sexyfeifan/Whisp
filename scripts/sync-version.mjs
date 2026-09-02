import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Resolve project root (script may be run from anywhere) ──────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Parse CLI flags ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
const CHECK_MODE = args.includes("--check");
const SKIP_CHANGELOG = args.includes("--no-changelog");

// ── Read canonical version from package.json ────────────────────────────
const packageJsonPath = path.join(ROOT, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const version = packageJson.version;
const semver = `v${version}`;

console.log(`Version: ${semver}`);

// ── File readers ────────────────────────────────────────────────────────
function readJson(relPath) {
  const p = path.join(ROOT, relPath);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function writeJson(relPath, obj) {
  fs.writeFileSync(path.join(ROOT, relPath), `${JSON.stringify(obj, null, 2)}\n`);
}

function writeText(relPath, text) {
  fs.writeFileSync(path.join(ROOT, relPath), text);
}

// ── Version extractors ──────────────────────────────────────────────────
function getPackageLockVersion() {
  const lock = readJson("package-lock.json");
  return lock.version;
}

function getCargoTomlVersion() {
  const toml = readText("src-tauri/Cargo.toml");
  const m = toml.match(/^\[package\][\s\S]*?^version = "([^"]+)"/m);
  return m ? m[1] : null;
}

function getCargoLockVersion() {
  const lock = readText("src-tauri/Cargo.lock");
  const m = lock.match(/\[\[package\]\]\nname = "whisp"\nversion = "([^"]+)"/);
  return m ? m[1] : null;
}

function getTauriConfVersion() {
  const conf = readJson("src-tauri/tauri.conf.json");
  return conf.version;
}

// ── Version writers (sync mode) ─────────────────────────────────────────
function syncPackageLock() {
  const lock = readJson("package-lock.json");
  lock.version = version;
  lock.packages[""].version = version;
  writeJson("package-lock.json", lock);
}

function syncCargoToml() {
  let toml = readText("src-tauri/Cargo.toml");
  toml = toml.replace(/^(\[package\][\s\S]*?^version = ")[^"]+("$)/m, `$1${version}$2`);
  writeText("src-tauri/Cargo.toml", toml);
}

function syncCargoLock() {
  let lock = readText("src-tauri/Cargo.lock");
  lock = lock.replace(
    /(\[\[package\]\]\nname = "whisp"\nversion = ")[^"]+("\n)/,
    `$1${version}$2`
  );
  writeText("src-tauri/Cargo.lock", lock);
}

function syncTauriConf() {
  const conf = readJson("src-tauri/tauri.conf.json");
  conf.version = version;
  writeJson("src-tauri/tauri.conf.json", conf);
}

// ── CHANGELOG auto-generation ───────────────────────────────────────────
function ensureChangelogEntry() {
  const changelogPath = path.join(ROOT, "CHANGELOG.md");

  if (!fs.existsSync(changelogPath)) {
    // Create a fresh CHANGELOG
    const today = new Date().toISOString().slice(0, 10);
    const content = `# Changelog\n\n## ${semver} (${today})\n\n- (add changes here)\n`;
    writeText("CHANGELOG.md", content);
    console.log(`  created CHANGELOG.md with ${semver} header`);
    return;
  }

  const existing = readText("CHANGELOG.md");
  // Check if this version already has a header
  if (existing.includes(`## ${semver}`)) {
    console.log(`  CHANGELOG.md already has ${semver} entry`);
    return;
  }

  // Insert new version header after "# Changelog" or at the very top
  const today = new Date().toISOString().slice(0, 10);
  const header = `## ${semver} (${today})\n\n- (add changes here)\n\n`;

  let updated;
  if (existing.startsWith("# Changelog")) {
    updated = existing.replace(
      "# Changelog\n",
      `# Changelog\n\n${header}`
    );
  } else {
    updated = `# Changelog\n\n${header}${existing}`;
  }

  writeText("CHANGELOG.md", updated);
  console.log(`  added ${semver} header to CHANGELOG.md`);
}

// ── Check mode: verify all versions match ───────────────────────────────
if (CHECK_MODE) {
  console.log("\nChecking version consistency…\n");

  const sources = [
    { name: "package.json",            ver: version },
    { name: "package-lock.json",       ver: getPackageLockVersion() },
    { name: "src-tauri/Cargo.toml",    ver: getCargoTomlVersion() },
    { name: "src-tauri/Cargo.lock",    ver: getCargoLockVersion() },
    { name: "src-tauri/tauri.conf.json", ver: getTauriConfVersion() },
  ];

  let mismatch = false;
  for (const { name, ver } of sources) {
    const ok = ver === version;
    const marker = ok ? "✓" : "✗ MISMATCH";
    console.log(`  ${marker}  ${name}: ${ver}`);
    if (!ok) mismatch = true;
  }

  if (mismatch) {
    console.error(`\nVersion mismatch detected. Expected ${version} everywhere.`);
    process.exit(1);
  } else {
    console.log(`\nAll files in sync at ${version}.`);
    process.exit(0);
  }
}

// ── Sync mode: write version to all files ───────────────────────────────
console.log("\nSyncing version across files…\n");

syncPackageLock();
console.log("  ✓ package-lock.json");

syncCargoToml();
console.log("  ✓ src-tauri/Cargo.toml");

syncCargoLock();
console.log("  ✓ src-tauri/Cargo.lock");

syncTauriConf();
console.log("  ✓ src-tauri/tauri.conf.json");

if (!SKIP_CHANGELOG) {
  ensureChangelogEntry();
}

console.log(`\nSynced version: ${version}`);
