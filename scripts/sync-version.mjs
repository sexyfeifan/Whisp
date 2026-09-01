import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const version = packageJson.version;

const packageLock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
packageLock.version = version;
packageLock.packages[""].version = version;
fs.writeFileSync("package-lock.json", `${JSON.stringify(packageLock, null, 2)}\n`);

let cargoToml = fs.readFileSync("src-tauri/Cargo.toml", "utf8");
cargoToml = cargoToml.replace(/^(\[package\][\s\S]*?^version = ")[^"]+("$)/m, `$1${version}$2`);
fs.writeFileSync("src-tauri/Cargo.toml", cargoToml);

let cargoLock = fs.readFileSync("src-tauri/Cargo.lock", "utf8");
cargoLock = cargoLock.replace(/(\[\[package\]\]\nname = "whisp"\nversion = ")[^"]+("\n)/, `$1${version}$2`);
fs.writeFileSync("src-tauri/Cargo.lock", cargoLock);

const tauriConfig = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8"));
tauriConfig.version = version;
fs.writeFileSync("src-tauri/tauri.conf.json", `${JSON.stringify(tauriConfig, null, 2)}\n`);

console.log(`Synced version: ${version}`);
