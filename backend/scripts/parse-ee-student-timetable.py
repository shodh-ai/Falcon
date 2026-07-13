#!/usr/bin/env python3
"""Parse EE student timetable xlsx (wrapper — runs build-ee-seed-data.py)."""

import subprocess
import sys
from pathlib import Path

if __name__ == "__main__":
    script = Path(__file__).resolve().parent / "build-ee-seed-data.py"
    raise SystemExit(subprocess.call([sys.executable, str(script)]))
