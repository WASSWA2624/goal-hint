"""Prepare local app downloads from the native delivery archives in deploy/."""
import argparse
from pathlib import Path
from lib.app_downloads import prepare_app_downloads
from lib.runtime import main_guard


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--channel", choices=("development", "production"), default="development")
    parser.add_argument("--root", type=Path)
    args = parser.parse_args()
    root = prepare_app_downloads(args.channel, args.root)
    print(f"App downloads prepared in {root}.")


if __name__ == "__main__":
    main_guard(main, "App download preparation failed; existing published files were preserved.")
