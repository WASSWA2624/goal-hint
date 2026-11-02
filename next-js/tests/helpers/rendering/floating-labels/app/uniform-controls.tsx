"use client";

import styled from "styled-components";
import { compactHeaderControl, compactHeaderIconControl, compactHeaderRow } from "@/components/ui/header-controls";

const Header = styled.div`${compactHeaderRow} grid-column: 1 / -1;`;
const Action = styled.button`${compactHeaderControl}`;
const IconAction = styled.button`${compactHeaderIconControl}`;

export function CompactHeaderControls() {
  return <Header data-uniform-row="header controls"><Action type="button">Account</Action><IconAction type="button" aria-label="Header utility">+</IconAction></Header>;
}
