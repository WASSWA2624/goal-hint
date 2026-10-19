"use client";

import { useState } from "react";
import { SegmentedChoice } from "@/components/ui/controls";

export function SegmentedChoiceProbe() {
  const [value, setValue] = useState("mtn");
  return <SegmentedChoice label="Paid to our" value={value} options={[{ value: "mtn", label: "MTN" }, { value: "airtel", label: "Airtel" }]} onValueChange={setValue} />;
}
