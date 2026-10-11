"""Measure the existing Node collector; this is local CPU evidence only."""
import json
from statistics import median

from lib.runtime import main_guard, service


def main() -> None:
    iterations, rounds, calls = 250_000, 6, 50_000
    measured = service("monitoring-benchmark", {"iterations": iterations, "rounds": rounds, "wrapperCalls": calls})
    snapshot = measured["snapshot"]
    assert len(snapshot["series"]) == 25
    assert measured["serializedBytes"] < 16_384
    assert sum(series["count"] for series in snapshot["series"]) == iterations * rounds
    assert measured["preservesIdentity"], "Disabled wrapper must return the original response."
    print(json.dumps({"evidence": "local-in-process-microbenchmark", "iterationsPerRound": iterations,
        "rounds": rounds - 1, "medianMicrosecondsPerRecord": median(measured["samples"]),
        "disabledWrapperMicrosecondsPerCall": measured["disabledWrapperMicrosecondsPerCall"],
        "series": len(snapshot["series"]), "serializedBytes": measured["serializedBytes"],
        "productionFieldEvidence": False}))


if __name__ == "__main__":
    main_guard(main)
