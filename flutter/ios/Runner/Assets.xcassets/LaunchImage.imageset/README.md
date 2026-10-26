# Goal Hint launch artwork

These 1x/2x/3x images are generated from the shared primary brand mark by
[`tool/generate-icons.mjs`](../../../../tool/generate-icons.mjs). Their logical
size is 96 points, matching the native launch storyboard and Flutter loading mark.

From the repository root, run `node flutter/tool/generate-icons.mjs` to regenerate
or append `--check` to verify the committed outputs. Do not hand-edit these PNGs.
The native storyboard supplies the white background and Goal Hint name; Flutter
adds the loading indicator after its first frame.
