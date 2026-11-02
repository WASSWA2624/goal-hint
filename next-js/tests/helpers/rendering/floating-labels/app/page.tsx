"use client";

import { useState } from "react";
import styled, { ThemeProvider } from "styled-components";
import { ActionButton as OwnerAction, FieldBlock, FieldRow } from "@/components/admin/admin-form";
import { FeedSearchInput } from "@/components/match/feed-search-input";
import { CompactSelect } from "@/components/match/filter-parts";
import { SlipNumericInput } from "@/components/slips/slip-numeric-input";
import { CustomRangeButton, DateControls, DateSelect } from "@/components/slips/best-slips-filter-styles";
import { AmountInput } from "@/components/ui/amount-input";
import { Button, ButtonLink, FileInput, SelectInput, TextInput } from "@/components/ui/controls";
import { inlineControlRow } from "@/components/ui/control-layout";
import { FloatingField } from "@/components/ui/floating-field";
import { PhoneInput } from "@/components/ui/phone-input";
import { SearchIcon } from "@/components/ui/icons";
import { SelectMenu } from "@/components/ui/select-menu";
import { darkTheme, lightTheme } from "@/styles/theme";
import { GlobalStyle } from "@/styles/global-style";
import { AccountCard, AccountCardBody } from "@/components/members/account-styles";
import { WizardActions } from "@/components/members/payment-wizard";
import { CheckoutActions } from "@/components/members/checkout-parts";
import { Segmented, TextAction } from "@/components/admin/desk-styles";
import { ToolButton } from "@/components/analytics/dashboard/dashboard-styles";
import { Inline } from "@/components/ui/layout";
import { CompactHeaderControls } from "./uniform-controls";

const Canvas = styled.main`
  padding: 16px; color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface};
  > form { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr)); }
  > header { display: flex; align-items: center; gap: 16px; margin-block-end: 16px; }
`;

const StepperPressure = styled.div`
  button { min-block-size: 36px; padding-block: 4px; font-size: 1rem; }
`;
const MixedControls = styled.div`
  display: flex; flex-wrap: wrap; gap: 10px; grid-column: 1 / -1;
  > [data-control-field] { flex: 1 1 12rem; }
  ${inlineControlRow}
`;
const SameFill = styled.section`
  padding: 12px; background: ${({ theme }) => theme.textField.background};
`;

export default function Page() {
  const [dark, setDark] = useState(false), [amount, setAmount] = useState("");
  const [rowError, setRowError] = useState(false);
  const [phone, setPhone] = useState("256"), [count, setCount] = useState("2"), [menu, setMenu] = useState("all");
  return <ThemeProvider theme={dark ? darkTheme : lightTheme}>
    <GlobalStyle />
    <Canvas data-floating-fixture data-mode={dark ? "dark" : "light"}>
      <header><h1>Floating fields</h1><Button onClick={() => setDark(value => !value)}>Toggle theme</Button></header>
      <form onSubmit={event => event.preventDefault()}>
        <FieldRow data-alignment-row data-uniform-row="owner fields" style={{ gridColumn: "1 / -1" }}>
          <TextInput label="Row text" hint="Help below this field must not move the control" />
          <SelectInput label="Row select" defaultValue="one"><option value="one">One</option></SelectInput>
          <OwnerAction>Row action</OwnerAction>
        </FieldRow>
        <MixedControls data-mixed-controls data-uniform-row="mixed nested controls">
          <div data-control-field><TextInput id="mixed-input" label="Mixed row field" defaultValue="Value" /></div>
          <DateControls data-mixed-dates>
            <DateSelect label="Mixed date picker" value={menu} options={[{ value: "all", label: "All dates" }, { value: "one", label: "Today" }]} onValueChange={setMenu} />
            <CustomRangeButton type="button" data-mixed-range>Custom dates</CustomRangeButton>
          </DateControls>
          <CompactSelect data-mixed-compact aria-label="Mixed compact select" value={menu}
            options={[{ value: "all", label: "All" }, { value: "one", label: "One" }]} onChange={event => setMenu(event.target.value)} />
          <Button data-mixed-action>Apply filters</Button>
          <ButtonLink href="#mixed-input" data-mixed-link>Open results</ButtonLink>
        </MixedControls>
        <AccountCard style={{ gridColumn: "1 / -1" }}><AccountCardBody>
          <Inline data-uniform-row="account validation">
            <TextInput label="Account field" error={rowError ? "A validation message must not move the other controls" : undefined} />
            <SelectInput label="Account choice" defaultValue="one"><option value="one">One</option></SelectInput>
            <Button onClick={() => setRowError(value => !value)} data-toggle-row-error>Toggle validation</Button>
          </Inline>
          <WizardActions data-uniform-row="payment wizard"><Button>Back</Button><Button size="large">Continue</Button></WizardActions>
          <CheckoutActions data-uniform-row="checkout actions"><Button>Back</Button><ButtonLink href="#mixed-input">Continue</ButtonLink></CheckoutActions>
        </AccountCardBody></AccountCard>
        <Inline data-uniform-row="public and owner actions" style={{ gridColumn: "1 / -1" }}>
          <Button>Public action</Button><Button size="large">Emphasized action</Button><ToolButton>Analytics action</ToolButton><TextAction>Owner action</TextAction>
        </Inline>
        <Inline data-uniform-row="composite fields" style={{ gridColumn: "1 / -1" }}>
          <PhoneInput label="Row phone" value={phone} onValueChange={setPhone} hint="A country selector shares the input height" />
          <FeedSearchInput label="Row search" submitLabel="Search row" />
          <Button>Find account</Button>
        </Inline>
        <Segmented data-uniform-row="owner tabs" style={{ gridColumn: "1 / -1" }}><button type="button">Active</button><a href="#mixed-input">History</a></Segmented>
        <CompactHeaderControls />
        <div data-uniform-row="native control baseline" style={{ display: "flex", gap: 8, gridColumn: "1 / -1" }}>
          <button type="button">Native action</button><select aria-label="Native standalone choice"><option>One</option></select>
        </div>
        <SameFill data-same-fill><FloatingField label="Same background"><input id="same-fill" defaultValue="Value" /></FloatingField></SameFill>
        <TextInput id="empty" label="Empty text" placeholder="Example value" name="text" hint="Text hint" />
        <TextInput id="leading" label="Search account" leading={<SearchIcon />} />
        <TextInput id="filled" label="Restored text" defaultValue="Saved value" />
        <TextInput id="number" label="Number" type="number" defaultValue={0} />
        <TextInput id="password" label="Password" type="password" />
        <TextInput id="date" label="Date" type="date" />
        <TextInput id="time" label="Time" type="time" />
        <TextInput id="datetime" label="Date and time" type="datetime-local" />
        <TextInput id="restored-date" label="Restored date" type="date" defaultValue="2026-11-01" />
        <SelectInput id="select" label="Native choice" defaultValue=""><option value="">Choose</option><option value="one">One</option></SelectInput>
        <FloatingField label="Notes"><textarea id="notes" name="notes" placeholder="More information" /></FloatingField>
        <TextInput id="error" label="Invalid value" defaultValue="Invalid" error="Please correct this value" />
        <TextInput id="disabled" label="Disabled value" disabled defaultValue="Unavailable" />
        <TextInput id="readonly" label="Read only" readOnly defaultValue="Reference" />
        <AmountInput label="Amount" value={amount} onValueChange={setAmount} />
        <PhoneInput label="Phone number" value={phone} onValueChange={setPhone} />
        <FieldBlock label="Owner field"><input id="owner" name="owner" /></FieldBlock>
        <StepperPressure><SlipNumericInput field="slips" name="slips" label="Slip count" value={count} locale="en" onValueChange={setCount} /></StepperPressure>
        <SelectMenu label="Category" value={menu} options={[{ value: "all", label: "All categories" }, { value: "one", label: "One" }]} onValueChange={setMenu} />
        <FeedSearchInput label="Search matches" submitLabel="Search" placeholder="Find a team" />
        <FileInput label="Attachment" id="attachment" />
        <Button type="reset">Reset fields</Button>
      </form>
    </Canvas>
  </ThemeProvider>;
}
