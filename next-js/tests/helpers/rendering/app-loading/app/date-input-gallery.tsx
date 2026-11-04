"use client";
import { useState } from "react";
import { DateTimeField } from "@/components/ui/date-time-field";
import { SelectMenu } from "@/components/ui/select-menu";
import { Button } from "@/components/ui/controls";
export function DateInputGallery() {
  const [date, setDate] = useState("2026-01-31"), [time, setTime] = useState("14:30"), [choice, setChoice] = useState("one"), [saved, setSaved] = useState("");
  return <form data-date-gallery onSubmit={event => { event.preventDefault(); setSaved(JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))); }}>
    <DateTimeField label="Report date" name="date" required value={date} onValueChange={setDate} min="2026-01-01" max="2028-12-31" />
    <DateTimeField label="Report time" name="time" required mode="time" value={time} onValueChange={setTime} />
    <DateTimeField label="Received at" name="receivedAt" required mode="datetime" defaultValue="2026-01-04T14:05" />
    <SelectMenu label="Example choice" value={choice} onValueChange={setChoice} options={[
      { value: "one", label: "First choice" }, { value: "two", label: "Second choice" }, { value: "three", label: "Third choice" }]} />
    <Button type="submit">Submit dates</Button><output data-saved-date>{saved}</output>
  </form>;
}
