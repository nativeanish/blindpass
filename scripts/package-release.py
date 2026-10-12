#!/usr/bin/env python3
"""Create a source deployment archive; never include live secrets or build output."""
import hashlib
from pathlib import Path
import tarfile

ROOT = Path(__file__).resolve().parent.parent
DESTINATION = ROOT / "artifacts" / "deployment"
SOURCE_DIRS = {"apps", "packages", "cli", "infra", "scripts", "tests", "docs", "book", "verification", ".github"}
SKIP_DIRS = {"node_modules", ".next", ".git", ".secrets", ".blindpass", "__pycache__", "backups", "coverage", "test-results", "playwright-report", "dist"}
ROOT_FILES = {
    "README.md", "SECURITY.md", "PROGRESS.md", "LICENSE", "LICENSE.md",
    "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "docker-compose.yml",
    "tsconfig.json", "eslint.config.mjs", "playwright.config.ts", "vitest.config.ts",
    ".dockerignore", ".gitignore", ".prettierignore", ".env.example", ".env.production.example",
    ".env.devnet.example", ".env.mainnet.example",
}


def permitted(path):
    relative = path.relative_to(ROOT)
    if path.is_symlink() or any(part in SKIP_DIRS for part in relative.parts):
        return False
    if path.name.startswith(".env") and path.name not in ROOT_FILES:
        return False
    if path.name.endswith((".tsbuildinfo", ".log", ".dump", ".pem", ".key", ".pyc")):
        return False
    return path.is_file()


def main():
    DESTINATION.mkdir(parents=True, exist_ok=True)
    files = [ROOT / name for name in ROOT_FILES if (ROOT / name).is_file()]
    # Prune before recursion so dependency trees do not need to be scanned.
    def walk(directory):
        for path in sorted(directory.iterdir()):
            if path.is_symlink():
                continue
            if path.is_dir():
                if path.name not in SKIP_DIRS:
                    yield from walk(path)
            elif permitted(path):
                yield path
    for name in sorted(SOURCE_DIRS):
        directory = ROOT / name
        if directory.is_dir():
            files.extend(walk(directory))
    files = sorted(set(files))
    archive = DESTINATION / "blindpass-source.tar.gz"
    temporary = archive.with_suffix(".partial")
    with tarfile.open(temporary, "w:gz") as output:
        for path in files:
            output.add(path, arcname=str(Path("blindpass") / path.relative_to(ROOT)), recursive=False)
    temporary.replace(archive)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (DESTINATION / "SHA256SUMS").write_text(f"{digest}  {archive.name}\n")
    print(f"Packaged {len(files)} files: {archive} ({archive.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
