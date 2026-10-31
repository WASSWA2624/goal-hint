/** Reference geometry in metres, not a measurement of the fixture's venue.
 * Field: 105 × 68; markings: IFAB Law 1 (https://theifab.com/laws/latest/the-field-of-play/).
 */
export const referencePitch = Object.freeze({
  length: 105, width: 68, margin: 3, goalWidth: 7.32, goalDepth: 2,
  penaltyDepth: 16.5, goalAreaDepth: 5.5, penaltySpot: 11, circleRadius: 9.15,
});
export const pitchCanvas = Object.freeze({
  length: referencePitch.length + referencePitch.margin * 2,
  width: referencePitch.width + referencePitch.margin * 2,
});

/** Project formation percentages into the same coordinate system as the field markings. */
export function pitchCanvasPosition(x: number, y: number) {
  return {
    x: 100 * (referencePitch.margin + referencePitch.length * x / 100) / pitchCanvas.length,
    y: 100 * (referencePitch.margin + referencePitch.width * y / 100) / pitchCanvas.width,
  };
}
