import type { FixtureSnapshot } from "./fixture-snapshot";
import type { Messages } from "../i18n/messages";

const secondsPerMinute = 60;
// Allow for one delayed minute update before holding the last estimate.
const maximumEstimatedSeconds = 2 * secondsPerMinute - 1;

/** Render observed football time; paused phases take precedence over stale minutes. */
export function liveClockLabel(clock: FixtureSnapshot["liveClock"], messages: Messages, now?: number, showStoppageSeconds = false) {
  const phase = clock?.phase ?? "in-play";
  const running = phase === "first-half" || phase === "second-half" || phase === "extra-time" || phase === "in-play";
  const minute = running ? clock?.minute ?? null : null;
  const stoppage = minute === null ? null : clock?.stoppageMinutes;
  const phaseLabel = messages.text(`match.clock.${phase}`);
  const digits = (value: number) => messages.number(value, { minimumIntegerDigits: 2, useGrouping: false });
  const regulationEnd = phase === "first-half" ? 45 : phase === "second-half" ? 90 : null;
  // Some observations include added time in the elapsed minute itself.
  const reportedOffset = showStoppageSeconds && minute !== null && regulationEnd !== null ? Math.max(0, minute - regulationEnd) : 0;
  const reportedMinute = minute === null ? null : minute - reportedOffset;
  const reportedStoppage = reportedOffset ? Math.max(reportedOffset, stoppage ?? 0) : stoppage;
  let visible = phaseLabel;
  if (reportedMinute !== null) {
    const phaseEnd = regulationEnd ?? (phase === "extra-time" ? reportedMinute <= 105 ? 105 : 120 : Infinity);
    const observedMinute = reportedMinute + (reportedStoppage ?? 0);
    // Only a provider observation can start stoppage time or a new phase.
    const phaseSeconds = (Math.max(phaseEnd, observedMinute) - observedMinute + 1) * secondsPerMinute - 1;
    const elapsedSeconds = now === undefined || clock?.observedAt === undefined ? 0
      : Math.min(phaseSeconds, maximumEstimatedSeconds, Math.max(0, Math.floor((now - clock.observedAt) / 1000)));
    const currentMinute = observedMinute + Math.floor(elapsedSeconds / secondsPerMinute);
    const currentSeconds = digits(elapsedSeconds % secondsPerMinute);
    visible = showStoppageSeconds && reportedStoppage
      ? `${digits(reportedMinute)}+${digits(currentMinute - reportedMinute)}:${currentSeconds}`
      : `${digits(currentMinute)}:${currentSeconds}`;
  }
  const spoken = [messages.text("match.status.live"), phase === "half-time" ? messages.text("match.clock.halfTimeLabel")
    : phase === "in-play" ? null : phaseLabel,
    reportedMinute === null ? null : messages.text("match.clock.minuteLabel", { minute: messages.number(reportedMinute) }),
    reportedStoppage ? messages.text("match.clock.stoppageLabel", { minute: messages.number(reportedStoppage) }) : null].filter(Boolean).join(", ");
  const extra = phase === "extra-time" ? messages.text("match.clock.extra-timeShort") : null;
  const badgeTime = minute === null ? null : !showStoppageSeconds && stoppage ? `${digits(minute)}+${digits(stoppage)}` : visible;
  const badge = extra ? [extra, badgeTime].filter(Boolean).join(" ") : badgeTime ?? (running ? messages.text("match.status.live") : phaseLabel);
  return { minute, visible, spoken, phaseLabel, badge, badgeTicks: minute !== null && (showStoppageSeconds || !stoppage) };
}
