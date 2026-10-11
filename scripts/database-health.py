"""Read database readiness through the shared application connection pool."""
from lib.runtime import main_guard, service


def main():
    status = service("database-health")
    print(f"Database readiness: {status}.")
    return 1 if status == "unavailable" else 0


if __name__ == "__main__":
    main_guard(main, "Database readiness: unavailable. Check private configuration and approved access.")
