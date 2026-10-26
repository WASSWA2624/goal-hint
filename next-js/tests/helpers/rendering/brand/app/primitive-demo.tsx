"use client";
import { useState } from "react";
import { Button, ButtonLink, TextLink, TextInput, SelectInput } from "@/components/ui/controls";
import { EmptyState, StatusText } from "@/components/ui/feedback";
import { BodyText, Inline, SectionHeading, Stack, Surface } from "@/components/ui/layout";
const longCopy = "LongUnbrokenInterfaceIdentifierLongUnbrokenInterfaceIdentifierLongUnbrokenInterfaceIdentifierLongUnbrokenInterfaceIdentifierLongUnbrokenInterfaceIdentifierLongUnbrokenInterfaceIdentifierLongUnbrokenInterfaceIdentifierLongUnbrokenInterfaceIdentifierLongUnbrokenInterfaceIdentifier";
export function PrimitiveDemo() {
  const [updated, setUpdated] = useState(false);
  return <Stack $gap="lg">
    <Surface><Stack><SectionHeading>Navigation and controls</SectionHeading>
      <Inline>
        <Button id="demo-primary" onClick={() => setUpdated(true)}>Update demonstration status</Button>
        <Button id="demo-secondary" variant="secondary">Secondary action</Button>
        <Button id="demo-quiet" variant="quiet">Quiet action</Button>
        <Button id="demo-disabled" disabled>Disabled action</Button>
        <ButtonLink id="navigate-delayed" href="/delayed" prefetch={false}>Open delayed style check</ButtonLink>
        <TextLink href="#fields">Go to labeled fields</TextLink>
      </Inline>
      <Button variant="secondary">{longCopy}</Button>
      <StatusText id="changing-status" tone={updated ? "correct" : "pending"} announce>
        {updated ? "Demonstration status updated" : "Waiting for the demonstration action"}
      </StatusText>
    </Stack></Surface>
    <Surface id="fields"><Stack><SectionHeading>Labeled fields</SectionHeading>
      <BodyText id="external-help">Existing description retained alongside the hint and validation error.</BodyText>
      <TextInput id="demo-input" label="Example text field" hint="Use synthetic text for this check." defaultValue="Example interface text" />
      <TextInput id="demo-invalid" label="Required field with an error" hint="This hint remains associated." error={"Please enter a value. " + longCopy} aria-describedby="external-help" required />
      <TextInput id="demo-disabled-input" label="Disabled example field" defaultValue="Disabled value" disabled />
      <SelectInput id="demo-select" label="Example selection" hint="A native select with its label." defaultValue="first">
        <option value="first">First demonstration option</option><option value="second">Second demonstration option</option>
      </SelectInput>
      <BodyText>{longCopy}</BodyText>
    </Stack></Surface>
    <Surface><Stack><SectionHeading>Status text and icons</SectionHeading><Inline>
      <StatusText tone="correct">Correct</StatusText><StatusText tone="incorrect">Incorrect</StatusText>
      <StatusText tone="pending">Pending</StatusText><StatusText tone="void">Void</StatusText>
      <StatusText tone="unavailable">Unavailable</StatusText>
    </Inline></Stack></Surface>
    <EmptyState title="No demonstration items" description={"This empty state is an interface example. " + longCopy}
      action={<Button variant="secondary">Example empty-state action</Button>} />
  </Stack>;
}

