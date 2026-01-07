import argparse
import os
import shutil
import subprocess
from pathlib import Path

SYSTEM_PREFIXES = ("/usr/lib/", "/System/")
VIRTUAL_PREFIXES = ("@loader_path/", "@rpath/", "@executable_path/")


def run(*args: str) -> None:
    subprocess.check_call(list(args))


def otool_deps(target: Path) -> list[str]:
    output = subprocess.check_output(["otool", "-L", str(target)], text=True)
    deps: list[str] = []
    for line in output.splitlines()[1:]:
        candidate = line.strip().split(" ", 1)[0]
        if candidate.startswith(SYSTEM_PREFIXES) or candidate.startswith(VIRTUAL_PREFIXES):
            continue
        deps.append(candidate)
    return deps


def set_id(target: Path, new_id: str) -> None:
    run("install_name_tool", "-id", new_id, str(target))


def change_ref(target: Path, old: str, new: str) -> None:
    try:
        run("install_name_tool", "-change", old, new, str(target))
    except subprocess.CalledProcessError:
        pass


def find_sox_extensions(root: Path) -> list[Path]:
    return list(root.rglob("_torchaudio_sox.so")) + list(root.rglob("libtorchaudio_sox.so"))


def copy_tree(root_src: Path, dest_dir: Path) -> tuple[Path, dict[str, str]]:
    dest_dir.mkdir(parents=True, exist_ok=True)
    rewrite_map: dict[str, str] = {}

    def copy_one(src: Path) -> Path:
        dst = dest_dir / src.name
        if not dst.exists():
            shutil.copy2(src, dst)
            set_id(dst, f"@loader_path/{dst.name}")
        rewrite_map[str(src)] = f"@loader_path/{dst.name}"
        return dst

    root_dst = copy_one(root_src)
    queue = [root_dst]
    seen = {str(root_src)}

    while queue:
        lib = queue.pop()
        for dep in otool_deps(lib):
            if dep in seen:
                continue
            dep_path = Path(dep)
            if not dep_path.exists():
                raise SystemExit(f"Missing dependency on build machine: {dep}")
            seen.add(dep)
            dep_dst = copy_one(dep_path)
            queue.append(dep_dst)

    for dylib in dest_dir.glob("*.dylib"):
        for absolute, loader_ref in rewrite_map.items():
            change_ref(dylib, absolute, loader_ref)

    return root_dst, rewrite_map


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--root",
        required=True,
        help="Directory to scan for torchaudio SOX binaries (site-packages or PyInstaller dist).",
    )
    args = parser.parse_args()

    sox_env = os.environ.get("SOX_DYLIB")
    if not sox_env:
        raise SystemExit("SOX_DYLIB env var not set (path to libsox.dylib).")

    root = Path(args.root).resolve()
    if not root.exists():
        raise SystemExit(f"Path not found: {root}")

    sox_exts = find_sox_extensions(root)
    if not sox_exts:
        raise SystemExit(
            "Could not find torchaudio SOX extensions in the provided path (expected _torchaudio_sox.so / libtorchaudio_sox.so)."
        )

    sox_src = Path(sox_env).resolve()
    if not sox_src.exists():
        raise SystemExit(f"SOX_DYLIB not found: {sox_src}")
    if sox_src.is_symlink():
        sox_src = sox_src.resolve()

    for ext in sox_exts:
        dest_dir = ext.parent
        root_dst, rewrite_map = copy_tree(sox_src, dest_dir)
        change_ref(ext, "@rpath/libsox.dylib", f"@loader_path/{root_dst.name}")
        change_ref(ext, str(sox_src), f"@loader_path/{root_dst.name}")
        for absolute, loader_ref in rewrite_map.items():
            change_ref(ext, absolute, loader_ref)
        print(f"Vendored sox into: {dest_dir}")
        print(f"Patched extension: {ext}")


if __name__ == "__main__":
    main()
