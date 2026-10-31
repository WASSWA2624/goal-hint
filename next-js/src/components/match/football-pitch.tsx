import type { SVGProps } from "react";
import { pitchCanvas, referencePitch as pitch } from "@/domain/football-pitch";

const middle = pitch.margin + pitch.width / 2;
const penaltyWidth = pitch.goalWidth + pitch.penaltyDepth * 2;
const goalAreaWidth = pitch.goalWidth + pitch.goalAreaDepth * 2;
const arcOffset = Math.sqrt(pitch.circleRadius ** 2 - (pitch.penaltyDepth - pitch.penaltySpot) ** 2);

/** A single uniform scale keeps goals, boxes, arcs and the centre circle in proportion. */
export function FootballPitch(props: SVGProps<SVGSVGElement>) {
  return <svg {...props} viewBox={`0 0 ${pitchCanvas.length} ${pitchCanvas.width}`} preserveAspectRatio="xMidYMid meet">
    <g stroke="none" data-grass>{Array.from({ length: 10 }, (_, index) => <rect key={index} data-stripe={index % 2}
      x={pitch.margin + index * pitch.length / 10} y={pitch.margin} width={pitch.length / 10} height={pitch.width} />)}</g>
    <g data-markings fill="none" stroke="currentColor" strokeWidth=".12">
      <rect data-field-boundary x={pitch.margin} y={pitch.margin} width={pitch.length} height={pitch.width} />
      <path d={`M${pitchCanvas.length / 2} ${pitch.margin}v${pitch.width}`} />
      <circle data-centre-circle cx={pitchCanvas.length / 2} cy={middle} r={pitch.circleRadius} />
      <circle cx={pitchCanvas.length / 2} cy={middle} r=".16" fill="currentColor" />
      {(["left", "right"] as const).map(side => <g key={side} transform={side === "right" ? `translate(${pitchCanvas.length} 0) scale(-1 1)` : undefined}>
        <rect data-pitch-goal={side} x={pitch.margin - pitch.goalDepth} y={middle - pitch.goalWidth / 2} width={pitch.goalDepth} height={pitch.goalWidth} />
        <path data-penalty-area={side} d={`M${pitch.margin} ${middle - penaltyWidth / 2}h${pitch.penaltyDepth}v${penaltyWidth}H${pitch.margin}`} />
        <path d={`M${pitch.margin} ${middle - goalAreaWidth / 2}h${pitch.goalAreaDepth}v${goalAreaWidth}H${pitch.margin}`} />
        <circle cx={pitch.margin + pitch.penaltySpot} cy={middle} r=".16" fill="currentColor" />
        <path d={`M${pitch.margin + pitch.penaltyDepth} ${middle - arcOffset}a${pitch.circleRadius} ${pitch.circleRadius} 0 0 1 0 ${arcOffset * 2}`} />
        <path d={`M${pitch.margin} ${pitch.margin + 1}a1 1 0 0 0 1-1M${pitch.margin} ${pitch.margin + pitch.width - 1}a1 1 0 0 1 1 1`} />
      </g>)}
    </g>
  </svg>;
}
