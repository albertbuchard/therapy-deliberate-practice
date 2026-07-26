from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parents[2] / "desktop" / "scripts" / "verify-release-artifacts.py"
SPEC = importlib.util.spec_from_file_location("verify_release_artifacts", SCRIPT_PATH)
assert SPEC and SPEC.loader
verify_release_artifacts = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(verify_release_artifacts)

SOURCE_SHA = "a" * 40
VERSION = "0.1.5"
PACKAGE_NAMES = {
    "aarch64-apple-darwin": ["Local.Runtime_0.1.5_aarch64.dmg"],
    "x86_64-apple-darwin": ["Local.Runtime_0.1.5_x64.dmg"],
    "x86_64-pc-windows-msvc": [
        "Local.Runtime_0.1.5_x64-setup.exe",
        "Local.Runtime_0.1.5_x64.msi",
    ],
    "x86_64-unknown-linux-gnu": [
        "Local.Runtime_0.1.5_amd64.AppImage",
        "Local.Runtime_0.1.5_amd64.deb",
        "Local.Runtime_0.1.5_amd64.rpm",
    ],
}


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def signature_receipt(target: str) -> dict:
    if target.endswith("apple-darwin"):
        checks = {
            "app_codesign": True,
            "app_gatekeeper": True,
            "dmg_stapled": True,
        }
    elif target == "x86_64-pc-windows-msvc":
        checks = {
            "installer_authenticode": True,
            "desktop_authenticode": True,
            "sidecar_authenticode": True,
        }
    else:
        checks = {"not_applicable": True}
    return {
        "schema_version": 1,
        "target": target,
        "status": verify_release_artifacts.EXPECTED_SIGNING[target],
        "checks": checks,
    }


def native_backend_result(family: str) -> dict:
    fixture = verify_release_artifacts.NATIVE_BACKEND_FIXTURES[family]
    is_stt = fixture["endpoint"] == "audio.transcriptions"
    backend = {
        "family": family,
        "result": "passed",
        "model_ref": fixture["model_ref"],
        "revision": fixture["revision"],
        "packages": {name: "1.0.0" for name in fixture["packages"]},
        "request_shape": {
            "endpoint": fixture["endpoint"],
            "stream": False,
            "input_sha256": "8" * 64,
        },
        "output": {
            "type": "dict",
            "keys": ["text"] if is_stt else ["output_text"],
            "text_chars": 0,
        },
        "timing_ms": {"load": 1.0, "request": 1.0},
    }
    if fixture["has_model_files"]:
        backend["model_files"] = [{"path": "model.safetensors", "bytes": 1, "sha256": "9" * 64}]
    return backend


def native_backend_receipt(target: str, provenance: dict) -> dict | None:
    expected = verify_release_artifacts.NATIVE_BACKEND_TARGETS.get(target)
    if expected is None:
        return None
    machine = "arm64" if target == "aarch64-apple-darwin" else "x86_64"
    return {
        "schema_version": 1,
        "recorded_at": "2026-07-25T00:00:00+00:00",
        "result": "passed",
        "platform": {
            "system": expected["system"],
            "release": "test",
            "machine": machine,
            "python": "3.12.13",
            "target": target,
        },
        "source": {
            "git_sha": SOURCE_SHA,
            "runner_sha256": "5" * 64,
            "qwen_adapter_sha256": "6" * 64,
            "qwen_mlx_adapter_sha256": "7" * 64,
            "faster_whisper_adapter_sha256": "a" * 64,
            "parakeet_mlx_adapter_sha256": "b" * 64,
        },
        "runtime_provenance": provenance,
        "backends": [native_backend_result(family) for family in sorted(expected["families"])],
    }


def desktop_shell_receipt(target: str) -> dict:
    platform = (
        "darwin"
        if target.endswith("apple-darwin")
        else ("win32" if target == "x86_64-pc-windows-msvc" else "linux")
    )
    return {
        "schema_version": 1,
        "result": "passed",
        "target": target,
        "platform": platform,
        "executable": verify_release_artifacts.EXPECTED_DESKTOP_EXECUTABLES[target],
        "executable_sha256": "c" * 64,
        "launch_method": ("xvfb" if target == "x86_64-unknown-linux-gnu" else "direct"),
        "minimum_alive_ms": 3_000,
        "alive_ms": 3_010.0,
        "process_started": True,
        "process_stopped": True,
        "exit_code_before_stop": None,
        "limitation": None,
    }


def write_valid_target(root: Path, target: str) -> Path:
    target_root = root / target
    packages_dir = target_root / "packages"
    packages_dir.mkdir(parents=True)
    artifacts = []
    for index, name in enumerate(PACKAGE_NAMES[target], start=1):
        payload = f"{target}:{index}".encode()
        package = packages_dir / name
        package.write_bytes(payload)
        artifacts.append(
            {
                "path": f"packages/{name}",
                "bytes": len(payload),
                "sha256": digest(payload),
            }
        )
    provenance = {
        "schema_version": 1,
        "target": target,
        "python_version": "3.12.13",
        "python_asset": f"python-{target}.tar.gz",
        "python_asset_sha256": "1" * 64,
        "asset_manifest_sha256": "2" * 64,
        "runtime_source_sha256": "3" * 64,
        "app_version": VERSION,
        "launcher_target": target,
        "launcher_sha256": "4" * 64,
    }
    platform = (
        "darwin"
        if target.endswith("apple-darwin")
        else ("win32" if target == "x86_64-pc-windows-msvc" else "linux")
    )
    smoke = {
        "schema_version": 1,
        "result": "passed",
        "launcher": "local-runtime-gateway",
        "packaged_launcher_sha256": (
            "9" * 64 if target.endswith("apple-darwin") else provenance["launcher_sha256"]
        ),
        "runtime_provenance": provenance,
        "health": {
            "service": "therapy-local-runtime",
            "protocol_version": "1",
            "status": "ready",
        },
        "model_count": 2,
        "startup_ms": 100.0,
        "process_stopped": True,
        "platform": platform,
    }
    native_backend_smoke = native_backend_receipt(target, provenance)
    signature = signature_receipt(target)
    manifest = {
        "schema_version": 1,
        "target": target,
        "app_version": VERSION,
        "source_sha": SOURCE_SHA,
        "signing_status": signature["status"],
        "signature_evidence": signature,
        "portable_runtime": provenance,
        "packaged_sidecar_smoke": smoke,
        "desktop_shell_smoke": desktop_shell_receipt(target),
        "native_backend_smoke": native_backend_smoke,
        "artifact_count": len(artifacts),
        "artifact_bytes": sum(item["bytes"] for item in artifacts),
        "artifacts": artifacts,
    }
    path = target_root / "artifact-manifest.json"
    path.write_text(json.dumps(manifest))
    return path


def test_valid_complete_release_passes(tmp_path) -> None:
    for target in PACKAGE_NAMES:
        write_valid_target(tmp_path, target)

    verify_release_artifacts.verify_release(tmp_path, f"v{VERSION}", SOURCE_SHA)


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        (lambda manifest: manifest.update(artifacts=[]), "no publishable packages"),
        (
            lambda manifest: manifest["portable_runtime"].update(target="wrong-target"),
            "provenance is inconsistent",
        ),
        (
            lambda manifest: manifest.update(artifact_count=999),
            "artifact_count",
        ),
        (
            lambda manifest: manifest["packaged_sidecar_smoke"].update(runtime_provenance={}),
            "smoke is inconsistent",
        ),
        (
            lambda manifest: manifest["packaged_sidecar_smoke"].update(packaged_launcher_sha256="tampered"),
            "smoke is inconsistent",
        ),
        (
            lambda manifest: manifest["packaged_sidecar_smoke"].update(startup_ms=90_001),
            "smoke is inconsistent",
        ),
    ],
)
def test_fail_open_manifest_shapes_are_rejected(tmp_path, mutation, message) -> None:
    path = write_valid_target(tmp_path, "aarch64-apple-darwin")
    manifest = json.loads(path.read_text())
    mutation(manifest)

    with pytest.raises(RuntimeError, match=message):
        verify_release_artifacts.verify_manifest(
            path,
            manifest,
            expected_version=VERSION,
            source_sha=SOURCE_SHA,
        )


def test_unsigned_launcher_hash_must_match_sealed_provenance(tmp_path) -> None:
    path = write_valid_target(tmp_path, "x86_64-unknown-linux-gnu")
    manifest = json.loads(path.read_text())
    manifest["packaged_sidecar_smoke"]["packaged_launcher_sha256"] = "9" * 64

    with pytest.raises(RuntimeError, match="smoke is inconsistent"):
        verify_release_artifacts.verify_manifest(
            path,
            manifest,
            expected_version=VERSION,
            source_sha=SOURCE_SHA,
        )


@pytest.mark.parametrize(
    "target",
    [
        "aarch64-apple-darwin",
        "x86_64-pc-windows-msvc",
        "x86_64-unknown-linux-gnu",
    ],
)
def test_required_native_backend_receipt_cannot_be_omitted(tmp_path, target) -> None:
    path = write_valid_target(tmp_path, target)
    manifest = json.loads(path.read_text())
    manifest["native_backend_smoke"] = None

    with pytest.raises(RuntimeError, match="native backend smoke"):
        verify_release_artifacts.verify_manifest(
            path,
            manifest,
            expected_version=VERSION,
            source_sha=SOURCE_SHA,
        )


def test_apple_silicon_receipt_requires_both_pinned_mlx_families(tmp_path) -> None:
    path = write_valid_target(tmp_path, "aarch64-apple-darwin")
    manifest = json.loads(path.read_text())
    manifest["native_backend_smoke"]["backends"][0]["revision"] = "c" * 40

    with pytest.raises(RuntimeError, match="pinned fixture revision"):
        verify_release_artifacts.verify_manifest(
            path,
            manifest,
            expected_version=VERSION,
            source_sha=SOURCE_SHA,
        )


def test_desktop_shell_must_launch_and_stop_without_a_limitation(tmp_path) -> None:
    path = write_valid_target(tmp_path, "aarch64-apple-darwin")
    manifest = json.loads(path.read_text())
    manifest["desktop_shell_smoke"]["limitation"] = "not tested"

    with pytest.raises(RuntimeError, match="desktop-shell smoke"):
        verify_release_artifacts.verify_manifest(
            path,
            manifest,
            expected_version=VERSION,
            source_sha=SOURCE_SHA,
        )


def test_desktop_shell_must_identify_the_first_party_executable(tmp_path) -> None:
    path = write_valid_target(tmp_path, "x86_64-pc-windows-msvc")
    manifest = json.loads(path.read_text())
    manifest["desktop_shell_smoke"]["executable"] = "uninstall.exe"

    with pytest.raises(RuntimeError, match="desktop-shell smoke"):
        verify_release_artifacts.verify_manifest(
            path,
            manifest,
            expected_version=VERSION,
            source_sha=SOURCE_SHA,
        )
