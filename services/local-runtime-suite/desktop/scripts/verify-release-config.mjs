import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauriDir = path.resolve(desktopDir, "src-tauri");
const pythonDir = path.resolve(desktopDir, "..", "python");

function readJson(pathname) {
  return JSON.parse(readFileSync(pathname, "utf8"));
}

function matchVersion(pathname, pattern, label) {
  const match = readFileSync(pathname, "utf8").match(pattern);
  if (!match) throw new Error(`Could not read ${label} version from ${pathname}.`);
  return match[1];
}

const packageVersion = readJson(path.resolve(desktopDir, "package.json")).version;
const tauriConfig = readJson(path.resolve(tauriDir, "tauri.conf.json"));
const tauriVersion = tauriConfig.version;
const cargoVersion = matchVersion(
  path.resolve(tauriDir, "Cargo.toml"),
  /^\s*version\s*=\s*"([^"]+)"/m,
  "Cargo",
);
const cargoLockVersion = matchVersion(
  path.resolve(tauriDir, "Cargo.lock"),
  /name = "local-runtime-desktop"\nversion = "([^"]+)"/,
  "Cargo.lock",
);
const versions = new Set([packageVersion, tauriVersion, cargoVersion, cargoLockVersion]);
if (versions.size !== 1) {
  throw new Error(
    `Desktop versions disagree: package=${packageVersion}, Tauri=${tauriVersion}, Cargo=${cargoVersion}, Cargo.lock=${cargoLockVersion}.`,
  );
}

const assets = readJson(path.resolve(pythonDir, "python-runtime-assets.json"));
const requiredTargets = [
  "aarch64-apple-darwin",
  "x86_64-apple-darwin",
  "x86_64-pc-windows-msvc",
  "x86_64-unknown-linux-gnu",
];
if (JSON.stringify(Object.keys(assets.targets).sort()) !== JSON.stringify(requiredTargets.sort())) {
  throw new Error("Pinned Python runtime assets do not exactly cover the desktop build matrix.");
}
for (const [target, asset] of Object.entries(assets.targets)) {
  if (!/^[a-f0-9]{64}$/.test(asset.sha256)) {
    throw new Error(`Invalid Python runtime checksum for ${target}.`);
  }
  if (!asset.name.includes(assets.python_version) || !asset.name.includes(target)) {
    throw new Error(`Python runtime asset identity does not match ${target}.`);
  }
}

const minimumMacVersion = tauriConfig.bundle?.macOS?.minimumSystemVersion;
if (minimumMacVersion !== "14.0") {
  throw new Error(
    `Tauri must declare macOS 14.0 as the minimum version; found ${minimumMacVersion ?? "none"}.`,
  );
}

const uvLock = readFileSync(path.resolve(pythonDir, "uv.lock"), "utf8");
const requiredNativeWheels = [
  "torch-2.13.0-cp312-cp312-macosx_14_0_arm64.whl",
  "mlx-0.32.0-cp312-cp312-macosx_14_0_arm64.whl",
  "mlx_metal-0.32.0-py3-none-macosx_14_0_arm64.whl",
  "onnxruntime-1.23.2-cp312-cp312-macosx_13_0_x86_64.whl",
  "numba-0.66.0-cp312-cp312-macosx_12_0_arm64.whl",
  "llvmlite-0.48.0-cp312-cp312-macosx_12_0_arm64.whl",
];
for (const wheel of requiredNativeWheels) {
  if (!uvLock.includes(wheel)) {
    throw new Error(`The universal dependency lock is missing required native wheel ${wheel}.`);
  }
}
if (uvLock.includes("numba-0.53.1") || uvLock.includes("llvmlite-0.36.0")) {
  throw new Error("The dependency lock still contains obsolete Python-incompatible Numba wheels.");
}

const expectedTag = process.argv[2] ?? process.env.RELEASE_TAG;
if (expectedTag && expectedTag !== `v${packageVersion}`) {
  throw new Error(`Release tag ${expectedTag} does not match desktop version v${packageVersion}.`);
}
console.log(`Desktop release configuration is consistent at v${packageVersion}.`);
