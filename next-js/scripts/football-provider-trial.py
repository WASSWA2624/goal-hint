"""Parse the private trial CLI and reuse the application's bounded trial service."""
import sys
from lib.runtime import CommandError, main_guard, service

USAGE = "Usage: npm run trial:football -- init|report|run [--plan private-plan.json] [--directory private-directory] [--authority trusted-authority.mjs]"


def main():
    args = sys.argv[1:]
    options = {"action": args[0] if args else "", "directory": ".tmp/provider-trial"}
    fields = {"--directory": "directory", "--plan": "planFile", "--authority": "authorityFile"}
    seen = set()
    try:
        if options["action"] not in ("init", "report", "run") or len(args) % 2 != 1:
            raise CommandError("Provider trial command invalid-arguments; private input values are withheld.")
        for flag, value in zip(args[1::2], args[2::2]):
            field = fields.get(flag)
            if field is None or field in seen or value.startswith("--"):
                raise CommandError("Provider trial command invalid-arguments; private input values are withheld.")
            seen.add(field)
            options[field] = value
        result = service("football-trial", options)
    except CommandError as error:
        print(str(error), file=sys.stderr)
        print(USAGE, file=sys.stderr)
        return 1
    print(f"Provider trial: {result['reason']}. Suitability: {result['report']['liveSuitability']}. Odds import suitability: {result['report']['oddsSuitability']}.")
    print(f"Report: {result['reportFile']}")
    print(f"JSON: {result['jsonFile']}")
    return 2 if options["action"] == "run" and result["reason"] != "completed" else 0


if __name__ == "__main__":
    main_guard(main)
