"use client";

import { useState } from "react";
import { BrandMark } from "@/components/ui/brand";
import { Button, ButtonLink, SelectInput, TextInput, TextLink } from "@/components/ui/controls";
import { EmptyState, StatusText } from "@/components/ui/feedback";
import { BodyText, Inline, SectionHeading, Stack, Surface } from "@/components/ui/layout";

/** Imported only in development; these are interface examples, not football data. */
export function BrandDemo() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <Stack $gap="lg">
      <Surface aria-labelledby="preview-heading">
        <Stack>
          <Inline>
            <BrandMark alt="" />
            <SectionHeading id="preview-heading">Component preview</SectionHeading>
          </Inline>
          <BodyText>Development examples of the shared controls, feedback and layout.</BodyText>
          <Inline>
            <Button>Primary action</Button>
            <Button variant="secondary">Secondary action</Button>
            <Button variant="quiet">Quiet action</Button>
            <Button disabled>Disabled action</Button>
            <ButtonLink href="/#preview-form">Go to the example form</ButtonLink>
            <TextLink href="/#preview-states">View example states</TextLink>
          </Inline>
        </Stack>
      </Surface>

      <Surface aria-labelledby="form-heading">
        <form
          id="preview-form"
          onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}
        >
          <Stack>
            <SectionHeading id="form-heading">Labeled controls</SectionHeading>
            <TextInput
              name="example"
              label="An example input with a longer label that wraps on small screens"
              hint="This form is a local demonstration."
              autoComplete="off"
            />
            <TextInput
              name="example-error"
              label="Example validation error"
              defaultValue="A value to correct"
              error="This example needs a different value. The full message remains visible."
            />
            <SelectInput name="example-choice" label="Example choice" defaultValue="first">
              <option value="first">First option</option>
              <option value="second">A longer second option for the example control</option>
            </SelectInput>
            <Inline><Button type="submit">Show feedback</Button></Inline>
            {submitted && (
              <StatusText tone="pending" announce>
                The example was submitted. No information was sent.
              </StatusText>
            )}
          </Stack>
        </form>
      </Surface>

      <Surface id="preview-states" aria-labelledby="states-heading">
        <Stack>
          <SectionHeading id="states-heading">Outcome treatments</SectionHeading>
          <BodyText>Style examples only. These labels do not represent prediction results.</BodyText>
          <Inline>
            <StatusText tone="correct">Correct</StatusText>
            <StatusText tone="incorrect">Incorrect</StatusText>
            <StatusText tone="pending">Pending</StatusText>
            <StatusText tone="void">Void</StatusText>
            <StatusText tone="unavailable">Unavailable</StatusText>
          </Inline>
          <BodyText>
            Long text wraps without clipping, including this intentionally unbroken example:
            extraordinarilylongdevelopmentexamplethatmustremainreadableonasmallscreen.
          </BodyText>
        </Stack>
      </Surface>
      <EmptyState
        title="Example empty state"
        description="A short explanation belongs beside a clear next action when one is available."
        action={<ButtonLink href="/#preview-heading" variant="secondary">Return to the preview</ButtonLink>}
      />
    </Stack>
  );
}
