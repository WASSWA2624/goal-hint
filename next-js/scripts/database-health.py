"""Check application connectivity and required account schema without reading member data."""
from lib.runtime import main_guard, service


def main():
    status = service("database-health")
    print(f"Database readiness: {status}.")
    if status == "schema-unavailable":
        print("Check pending migrations and application-role account-table permissions.")
    return 0 if status in ("ready", "disabled") else 1


if __name__ == "__main__":
    main_guard(main, "Database readiness: unavailable. Check private configuration and approved access.")
