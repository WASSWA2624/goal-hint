"""Read the application's live readiness and its free provider account status."""
import json
from lib.runtime import main_guard, service


def main():
    status = service("live-status", operations=True)
    print(json.dumps(status, indent=2))
    return 0 if status["ready"] else 1


if __name__ == "__main__":
    main_guard(main)
