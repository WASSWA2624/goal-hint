"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button, SelectInput } from "@/components/ui/controls";
import { designs } from "./designs";
import { ReviewSurface, ReviewToolbar } from "./review-styles";
import { viewerModes, type ReviewViewer } from "./viewer-modes";

function subscribeDesign(notify: () => void) {
  window.addEventListener("hashchange", notify);
  return () => window.removeEventListener("hashchange", notify);
}
function selectedIndex() {
  return Math.max(0, designs.findIndex((design) => design.id === window.location.hash.slice(1)));
}

/** Switch only presentation: the real page, filter state and disclosures stay mounted. */
export function ReviewGallery({ children, viewer }: { children: ReactNode; viewer: ReviewViewer }) {
  const index = useSyncExternalStore(subscribeDesign, selectedIndex, () => 0);
  const [enabled, setEnabled] = useState(true);
  function choose(next: number) {
    window.history.replaceState(null, "", `#${designs[next]!.id}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }
  const selected = designs[index]!;
  return <>
    <ReviewToolbar aria-label="Desktop design review" data-design-review>
      <div data-review-heading><h1>Best Slips · Desktop design samples</h1>
        <p>Isolated sample data · 50 slips per page · Original content and controls</p><ThemeToggle />
      </div>
      <div data-review-controls>
        <Button variant="secondary" aria-label="Previous design" disabled={index === 0} onClick={() => choose(index - 1)}>←</Button>
        <SelectInput label="Design" aria-label="Desktop design" value={index} onChange={(event) => choose(Number(event.target.value))}>
          {designs.map((design, position) => <option key={design.id} value={position}>{position + 1}. {design.name}</option>)}
        </SelectInput>
        <Button variant="secondary" aria-label="Next design" disabled={index === designs.length - 1} onClick={() => choose(index + 1)}>→</Button>
        <SelectInput label="Viewer" aria-label="Review viewer" value={viewer} onChange={(event) => {
          const url = new URL(window.location.href);
          if (event.target.value === "subscriber") url.searchParams.delete("viewer");
          else url.searchParams.set("viewer", event.target.value);
          window.location.assign(url);
        }}>{viewerModes.map((mode) => <option key={mode.id} value={mode.id}>{mode.name}</option>)}</SelectInput>
        <p aria-live="polite" data-review-description>{selected.description}</p>
        <label><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />Preview styling</label>
      </div>
    </ReviewToolbar>
    <ReviewSurface $design={selected} $enabled={enabled} data-review-design={selected.id}>{children}</ReviewSurface>
  </>;
}
