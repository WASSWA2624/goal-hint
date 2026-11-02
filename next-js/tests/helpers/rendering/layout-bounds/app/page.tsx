"use client";

import { useState } from "react";
import { ThemeProvider } from "styled-components";
import { ChoicePicker } from "@/components/ui/choice-picker";
import { Button, ButtonLink, SelectInput, TextInput } from "@/components/ui/controls";
import { CriteriaDialog, CriteriaDialogButton } from "@/components/ui/criteria-dialog";
import { Inline } from "@/components/ui/layout";
import { SelectMenu } from "@/components/ui/select-menu";
import { useClientReady } from "@/components/ui/use-client-ready";
import { GlobalStyle } from "@/styles/global-style";
import { darkTheme, lightTheme } from "@/styles/theme";

const options = [{ value: "one", label: "One" }, { value: "two", label: "Both teams score and total goals" }];

export default function Page() {
  const ready = useClientReady();
  const [dark, setDark] = useState(false), [choice, setChoice] = useState("one");
  const [selected, setSelected] = useState<readonly string[]>(["one", "two"]), [validation, setValidation] = useState(false);
  const [dialog, setDialog] = useState("");
  const close = () => setDialog("");
  return <ThemeProvider theme={dark ? darkTheme : lightTheme}><GlobalStyle />
    <main data-layout-bounds-fixture data-ready={ready} data-mode={dark ? "dark" : "light"}
      style={{ padding: 16, paddingBottom: 100, display: "grid", gap: 16 }}>
      <Inline><Button onClick={() => setDark(value => !value)}>Toggle theme</Button>
        <Button onClick={() => setValidation(value => !value)}>Toggle validation</Button></Inline>
      <Inline data-layout-row="mixed fields">
        <TextInput label="Account field" hint="Hint below the control" error={validation ? "A longer validation message must stay below the control" : undefined} />
        <SelectInput label="Package" defaultValue="one"><option>One</option></SelectInput><Button>Apply filters</Button>
      </Inline>
      <Inline data-layout-row="payment actions"><Button>Try another screenshot</Button><ButtonLink href="#target">Use this screenshot</ButtonLink></Inline>
      <Inline><Button onClick={() => setDialog("payment")}>Open payment dialog</Button>
        <Button onClick={() => setDialog("filters")}>Open filter dialog</Button></Inline>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {(["start", "end"] as const).map(edge => <div key={edge} style={{ width: 80 }}>
          <SelectMenu data-layout-select={edge} label={`${edge} choice`} value={choice} options={options} onValueChange={setChoice} />
        </div>)}
      </div>
      <div id="target" style={{ position: "fixed", bottom: 8, right: 16, width: 140 }}>
        <ChoicePicker name="markets" label="Bottom choices" automaticLabel="Automatic" automaticHint="Synthetic choices"
          options={options} selected={selected} onChange={setSelected} />
      </div>
      <div style={{ position: "fixed", bottom: 8, left: 16, width: 80 }}>
        <SelectMenu data-layout-select="bottom" label="Bottom choice" value={choice} options={options} onValueChange={setChoice} />
      </div>
      <CriteriaDialog id="layout-payment" title="Payment screenshot" open={dialog === "payment"} onCancel={close} closeLabel="Close payment dialog"
        footer={<><CriteriaDialogButton variant="secondary" onClick={close}>Try another screenshot</CriteriaDialogButton>
          <CriteriaDialogButton onClick={close}>Use this screenshot</CriteriaDialogButton></>}>
        <p>Synthetic payment confirmation labels exercise narrow footers.</p>
      </CriteriaDialog>
      <CriteriaDialog id="layout-filters" title="Filter choices" open={dialog === "filters"} onCancel={close} closeLabel="Close filter dialog"
        onReset={() => {}} resetLabel="Reset all filters" onApply={close} applyLabel="Apply selected filters" cancelLabel="Cancel">
        <TextInput label="Filter value" hint="Synthetic helper text" />
      </CriteriaDialog>
    </main>
  </ThemeProvider>;
}
