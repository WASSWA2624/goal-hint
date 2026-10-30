import type { FixtureSnapshot } from "./fixture-snapshot";
import type { Messages } from "../i18n/messages";

/** Render observed football time; paused phases take precedence over stale minutes. */
export function liveClockLabel(clock: FixtureSnapshot["liveClock"], messages: Messages) {
  const phase = clock?.phase ?? "in-play";
  const running = phase === "first-half" || phase === "second-half" || phase === "extra-time" || phase === "in-play";
  const minute = running ? clock?.minute ?? null : null;
  const stoppage = minute === null ? null : clock?.stoppageMinutes;
  const elapsed = minute === null ? null : messages.number(minute) + (stoppage ? `+${messages.number(stoppage)}` : "");
  const phaseLabel = messages.text(`match.clock.${phase}`);
  const visible = elapsed === null ? phaseLabel : messages.text("match.clock.minute", { minute: elapsed });
  const spoken = [messages.text("match.status.live"), phase === "half-time" ? messages.text("match.clock.halfTimeLabel")
    : phase === "in-play" ? null : phaseLabel,
    minute === null ? null : messages.text("match.clock.minuteLabel", { minute: messages.number(minute) }),
    stoppage ? messages.text("match.clock.stoppageLabel", { minute: messages.number(stoppage) }) : null].filter(Boolean).join(", ");
  return { minute, visible, spoken, phaseLabel };
}
