"""Stage the dependency-free payment gallery for separate Sites publication."""
from pathlib import Path
import shutil


def main():
    app = Path(__file__).resolve().parents[1]
    source = app / "public" / "payment-samples"
    destination = app / ".tmp" / "payment-flow-site"
    (destination / ".openai").mkdir(parents=True, exist_ok=True)
    shutil.copy2(app / "payment-flow-site" / ".openai" / "hosting.json", destination / ".openai" / "hosting.json")
    shutil.copytree(source, destination / "dist", dirs_exist_ok=True)
    # These static files are the source of this buildless Site. The application
    # repository retains the original files under public/payment-samples.
    (destination / ".gitignore").write_text("node_modules/\n.sites-runtime/\n", encoding="utf-8")
    print(destination)


if __name__ == "__main__":
    main()
