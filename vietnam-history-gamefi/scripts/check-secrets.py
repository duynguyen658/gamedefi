#!/usr/bin/env python3
"""Fail when tracked files contain common credential formats or unsafe env files."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ROOT = Path(
    subprocess.check_output(
        ["git", "-C", str(PROJECT_ROOT), "rev-parse", "--show-toplevel"],
        text=True,
    ).strip()
)

SECRET_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("GitHub token", re.compile(r"(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})")),
    ("OpenAI API key", re.compile(r"sk-(?:proj-)?[A-Za-z0-9_-]{20,}")),
    ("Google API key", re.compile(r"AIza[0-9A-Za-z_-]{25,}")),
    ("Slack token", re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}")),
    ("AWS access key", re.compile(r"(?:AKIA|ASIA)[A-Z0-9]{16}")),
    ("JWT", re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")),
    (
        "Solana keypair byte array",
        re.compile(r"\[\s*(?:\d{1,3}\s*,\s*){63}\d{1,3}\s*\]"),
    ),
)
PRIVATE_KEY_PATTERN = re.compile(
    r"-----BEGIN " + r"(?:RSA |EC |OPENSSH )?PRIVATE KEY-----"
)
ENV_ASSIGNMENT = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$")
SENSITIVE_ENV_KEY = re.compile(
    r"(?:^|_)(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|REFRESH_TOKEN|BEARER_TOKEN|BOT_TOKEN|SECRET|PASSWORD|PRIVATE_KEY|MNEMONIC|SEED_PHRASE)(?:$|_)"
)


def tracked_files() -> list[str]:
    result = subprocess.run(
        ["git", "-C", str(ROOT), "ls-files", "-z"],
        check=True,
        stdout=subprocess.PIPE,
    )
    return [item.decode("utf-8", errors="surrogateescape") for item in result.stdout.split(b"\0") if item]


def is_env_example(path: str) -> bool:
    return Path(path).name.endswith(".env.example") or Path(path).name == ".env.example"


def is_env_file(path: str) -> bool:
    name = Path(path).name
    return name == ".env" or name.startswith(".env.") or name.endswith(".env") or ".env." in name


def is_placeholder(value: str) -> bool:
    cleaned = value.strip().strip('"').strip("'")
    if not cleaned:
        return True
    lowered = cleaned.lower()
    return (
        (cleaned.startswith("<") and cleaned.endswith(">"))
        or (cleaned.startswith("${") and cleaned.endswith("}"))
        or lowered.startswith(("your_", "your-", "replace_", "replace-", "change_me", "changeme"))
        or lowered in {"example", "redacted"}
    )


def line_number(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def main() -> int:
    findings: list[str] = []

    for relative in tracked_files():
        path = ROOT / relative
        if not path.is_file():
            continue

        if is_env_file(relative) and not is_env_example(relative):
            findings.append(f"{relative}: tracked environment file; keep it local and ignored")

        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue

        for label, pattern in SECRET_PATTERNS:
            for match in pattern.finditer(text):
                findings.append(f"{relative}:{line_number(text, match.start())}: possible {label}")
        for match in PRIVATE_KEY_PATTERN.finditer(text):
            findings.append(f"{relative}:{line_number(text, match.start())}: possible private key")

        if is_env_example(relative):
            for number, line in enumerate(text.splitlines(), start=1):
                match = ENV_ASSIGNMENT.match(line)
                if not match:
                    continue
                key, value = match.groups()
                if SENSITIVE_ENV_KEY.search(key) and not is_placeholder(value):
                    findings.append(
                        f"{relative}:{number}: {key} must be empty or use a clear placeholder"
                    )

    if findings:
        print("Secret check failed. Values are intentionally not printed:", file=sys.stderr)
        for finding in sorted(set(findings)):
            print(f"- {finding}", file=sys.stderr)
        return 1

    print("Secret check passed: tracked env files and common credential formats are clean.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
