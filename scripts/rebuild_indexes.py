"""Compatibility entry point: use the exporter's catalog and URL rules in Node."""
from pathlib import Path
import subprocess
import sys

if __name__ == "__main__":
    raise SystemExit(subprocess.call([
        "node", str(Path(__file__).with_suffix(".mjs")), *sys.argv[1:]
    ]))
