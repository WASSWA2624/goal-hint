import type { FixtureSnapshot } from "./fixture-snapshot";
import type { Messages } from "../i18n/messages";

const secondsPerMinute = 60;
// Allow for one delayed minute update before holding the last estimate.
const maximumEstimatedSeconds = 2 * secondsPerMinute - 1;

/** Render observed football time; paused phases take precedence over stale minutes. */
export function liveClockLabel(clock: FixtureSnapshot["liveClock"], messages: Messages, now?: number) {
  const phase = clock?.phase ?? "in-play";
  const running = phase === "first-half" || phase === "second-half" || phase === "extra-time" || phase === "in-play";
  const minute = running ? clock?.minute ?? null : null;
  const stoppage = minute === null ? null : clock?.stoppageMinutes;
  const phaseLabel = messages.text(`match.clock.${phase}`);
  const digits = (value: number) => messages.number(value, { minimumIntegerDigits: 2, useGrouping: false });
  let visible = phaseLabel;
  if (minute !== null) {
    const observedMinute = minute + (stoppage ?? 0);
    const phaseEnd = phase === "first-half" ? 45 : phase === "second-half" ? 90
      : phase === "extra-time" ? minute <= 105 ? 105 : 120 : Infinity;
    // Only a provider observation can start stoppage time or a new phase.
    const phaseSeconds = (Math.max(phaseEnd, observedMinute) - observedMinute + 1) * secondsPerMinute - 1;
    const elapsedSeconds = now === undefined || clock?.observedAt === undefined ? 0
      : Math.min(phaseSeconds, maximumEstimatedSeconds, Math.max(0, Math.floor((now - clock.observedAt) / 1000)));
    visible = `${digits(observedMinute + Math.floor(elapsedSeconds / secondsPerMinute))}:${digits(elapsedSeconds % secondsPerMinute)}`;
  }
  const spoken = [messages.text("match.status.live"), phase === "half-time" ? messages.text("match.clock.halfTimeLabel")
    : phase === "in-play" ? null : phaseLabel,
    minute === null ? null : messages.text("match.clock.minuteLabel", { minute: messages.number(minute) }),
    stoppage ? messages.text("match.clock.stoppageLabel", { minute: messages.number(stoppage) }) : null].filter(Boolean).join(", ");
  return { minute, visible, spoken, phaseLabel };
}
