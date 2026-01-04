import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pythonRoot = path.resolve(desktopDir, "..", "python");
const binariesDir = path.resolve(desktopDir, "src-tauri", "binaries");
const venvDir = path.resolve(pythonRoot, ".venv-tauri");
const stampPath = path.resolve(venvDir, ".deps.stamp.json");
const specPath = path.resolve(pythonRoot, "pyinstaller.local_runtime_gateway.spec");

const targetByPlatform = {
  darwin: {
    arm64: "aarch64-apple-darwin",
    x64: "x86_64-apple-darwin",
  },
  linux: {
    arm64: "aarch64-unknown-linux-gnu",
    x64: "x86_64-unknown-linux-gnu",
  },
  win32: {
    arm64: "aarch64-pc-windows-msvc",
    x64: "x86_64-pc-windows-msvc",
  },
};

const exeSuffix = process.platform === "win32" ? ".exe" : "";
const sidecarName = "local-runtime-gateway";

const venvPython =
  process.platform === "win32"
    ? path.resolve(venvDir, "Scripts", "python.exe")
    : path.resolve(venvDir, "bin", "python");

function banner(step, total, message) {
  console.log(`(${step}/${total}) ${message}`);
}

function runCommand(label, executable, args, options) {
  const cwd = options?.cwd ?? process.cwd();
  try {
    execFileSync(executable, args, {
      stdio: "inherit",
      ...options,
    });
  } catch (error) {
    const commandLine = [executable, ...args].join(" ");
    const details = [
      `${label} failed.`,
      `Interpreter: ${executable}`,
      `Working directory: ${cwd}`,
      `Command: ${commandLine}`,
      `Retry: (cd ${cwd} && ${commandLine})`,
    ];
    if (error instanceof Error && error.message) {
      details.push(`Error: ${error.message}`);
    }
    throw new Error(details.join("\n"));
  }
}

function resolveTarget() {
  const platformTargets = targetByPlatform[process.platform];
  if (!platformTargets) {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }
  const target = platformTargets[process.arch];
  if (!target) {
    throw new Error(`Unsupported architecture: ${process.arch}`);
  }
  return target;
}

function resolveSystemPython() {
  const candidate = process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3");
  try {
    const version = execFileSync(
      candidate,
      ["-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')"],
      { encoding: "utf8" },
    ).trim();
    const [major, minor] = version.split(".").map((value) => Number(value));
    if (!Number.isFinite(major) || !Number.isFinite(minor) || major < 3 || (major === 3 && minor < 10)) {
      throw new Error(`Python ${version} is too old.`);
    }
    return { path: candidate, version };
  } catch (error) {
    throw new Error(
      "Python 3.10+ is required to build the sidecar. Install Python and ensure python3 is available in PATH.",
    );
  }
}

function readVenvPythonVersion() {
  const version = execFileSync(
    venvPython,
    ["-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')"],
    { encoding: "utf8" },
  ).trim();
  const [major, minor] = version.split(".").map((value) => Number(value));
  if (!Number.isFinite(major) || !Number.isFinite(minor) || major < 3 || (major === 3 && minor < 10)) {
    throw new Error(`Venv Python ${version} is too old. Install Python 3.10+ and rebuild the venv.`);
  }
  return version;
}

function computeStamp(pyprojectHash, pythonVersion) {
  return JSON.stringify({ pyprojectHash, pythonVersion }, null, 2);
}

function loadStamp() {
  if (!existsSync(stampPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(stampPath, "utf8"));
  } catch (error) {
    return null;
  }
}

function hashPyproject() {
  const pyprojectPath = path.resolve(pythonRoot, "pyproject.toml");
  const contents = readFileSync(pyprojectPath);
  return crypto.createHash("sha256").update(contents).digest("hex");
}

function ensureVenv() {
  if (!existsSync(venvDir)) {
    const systemPython = resolveSystemPython();
    runCommand(
      "Virtual environment creation",
      systemPython.path,
      ["-m", "venv", venvDir],
      { cwd: pythonRoot },
    );
  }
  if (!existsSync(venvPython)) {
    throw new Error(`Expected venv python at ${venvPython}, but it was not found.`);
  }
}

function syncDependencies() {
  banner(3, 5, "Syncing Python dependencies...");
  const pyprojectHash = hashPyproject();
  const pythonVersion = readVenvPythonVersion();
  const stamp = loadStamp();
  if (stamp?.pyprojectHash === pyprojectHash && stamp?.pythonVersion === pythonVersion) {
    console.log("Dependencies unchanged; skipping install.");
    return;
  }
  banner(3, 5, "Syncing Python dependencies...");
  runCommand("Pip install", venvPython, ["-m", "pip", "install", "--upgrade", "pip"], {
    cwd: pythonRoot,
    env: {
      ...process.env,
      PIP_DISABLE_PIP_VERSION_CHECK: "1",
    },
  });
  runCommand("Pip install", venvPython, ["-m", "pip", "install", "-e", "."], {
    cwd: pythonRoot,
    env: {
      ...process.env,
      PIP_DISABLE_PIP_VERSION_CHECK: "1",
    },
  });
  runCommand("Pip install", venvPython, ["-m", "pip", "install", "pyinstaller"], {
    cwd: pythonRoot,
    env: {
      ...process.env,
      PIP_DISABLE_PIP_VERSION_CHECK: "1",
    },
  });
  writeFileSync(stampPath, computeStamp(pyprojectHash, pythonVersion));
}

function buildSidecar(distPath) {
  banner(4, 5, "Building sidecar with PyInstaller...");
  rmSync(path.resolve(pythonRoot, "dist"), { recursive: true, force: true });
  rmSync(path.resolve(pythonRoot, "build"), { recursive: true, force: true });
  runCommand("PyInstaller build", venvPython, ["-m", "PyInstaller", "--clean", "--noconfirm", specPath], {
    cwd: pythonRoot,
    env: {
      ...process.env,
      PYTHONNOUSERSITE: "1",
      PYTHONPATH: pythonRoot,
      VIRTUAL_ENV: venvDir,
    },
  });
  if (!existsSync(distPath)) {
    throw new Error(`Expected sidecar binary at ${distPath}, but it was not produced.`);
  }
}

function validateArtifact(outputPath) {
  if (!existsSync(outputPath)) {
    throw new Error(`Sidecar not found at ${outputPath}.`);
  }
  if (process.platform !== "win32") {
    chmodSync(outputPath, 0o755);
  }
}

function main() {
  const target = resolveTarget();
  const outputName = `${sidecarName}-${target}${exeSuffix}`;
  const distPath = path.resolve(pythonRoot, "dist", `${sidecarName}${exeSuffix}`);
  const outputPath = path.resolve(binariesDir, outputName);

  banner(1, 5, `Preparing sidecar for ${target}...`);
  mkdirSync(binariesDir, { recursive: true });
  banner(2, 5, "Bootstrapping venv...");
  ensureVenv();
  syncDependencies();
  buildSidecar(distPath);
  banner(5, 5, "Validating sidecar artifact...");
  chmodSync(distPath, process.platform === "win32" ? 0o644 : 0o755);
  mkdirSync(binariesDir, { recursive: true });
  rmSync(outputPath, { force: true });
  cpSync(distPath, outputPath);
  validateArtifact(outputPath);
  console.log(`Sidecar built: ${outputPath}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
