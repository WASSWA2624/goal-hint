"use client";

import { useState } from "react";
import styled, { ThemeProvider } from "styled-components";
import { MoonIcon, SunIcon } from "@/components/ui/icons";
import { Canvas, Content, Footer, Gallery, Intro, Label, Option, Review, Status, Toolbar, Viewport } from "@/components/navigation/header-review/gallery-styles";
import { resolveLocale } from "@/i18n/locales";
import { darkTheme, lightTheme } from "@/styles/theme";
import { BannerSample } from "./banner-sample";
import { bannerReviewDesigns, bannerReviewStates, type BannerReviewState } from "./designs";

const StateGroup = styled.div`
  display: grid;
  gap: 16px;
`;
const DesignHeading = styled.div`
  flex: 1;
  min-inline-size: 0;
`;
const Shortlist = styled.button`
  flex: none;
  min-block-size: 36px;
  padding: 6px 12px;
  border: 1px solid ${({ theme }) => theme.color.buttonBorder};
  color: ${({ theme }) => theme.color.link};
  background: ${({ theme }) => theme.color.surface};
  cursor: pointer;
  &[aria-pressed="true"] { color: ${({ theme }) => theme.color.onBrand}; background: ${({ theme }) => theme.color.brand}; }
`;

export function BannerDesignGallery({ locale }: { locale: string }) {
  const [dark, setDark] = useState(false);
  const [option, setOption] = useState(0);
  const [state, setState] = useState<BannerReviewState | "all">("all");
  const [width, setWidth] = useState(1280);
  const [shortlisted, setShortlisted] = useState<number | null>(null);
  const [notice, setNotice] = useState("Selected: 01 · Inline invitation. Applied on desktop; mobile design unchanged.");
  const designs = option ? bannerReviewDesigns.filter((design) => design.id === option) : bannerReviewDesigns;
  const states = state === "all" ? bannerReviewStates : bannerReviewStates.filter((item) => item.id === state);

  return <ThemeProvider theme={dark ? darkTheme : lightTheme}>
    <Review data-banner-review data-review-theme={dark ? "dark" : "light"}>
      <Content>
        <Intro>
          <span>Goal Hint · Desktop banner review</span>
          <h1>A small invitation. The right next step.</h1>
          <p>Compare ten compact banners directly beneath the same app header. Each shows signed-out visitors, signed-in members without a subscription, and active subscribers. Option 01 is applied on desktop. Mobile keeps its existing design.</p>
        </Intro>
        <Toolbar aria-label="Banner preview settings">
          <label><span>Design</span><select aria-label="Design option" value={option} onChange={(event) => setOption(Number(event.target.value))}>
            <option value={0}>All 10 designs</option>
            {bannerReviewDesigns.map((design) => <option key={design.id} value={design.id}>{String(design.id).padStart(2, "0")} · {design.name}</option>)}
          </select></label>
          <label><span>Account state</span><select aria-label="Account state" value={state} onChange={(event) => setState(event.target.value as BannerReviewState | "all")}>
            <option value="all">All three states</option>
            {bannerReviewStates.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select></label>
          <label><span>Desktop width</span><select aria-label="Desktop preview width" value={width} onChange={(event) => setWidth(Number(event.target.value))}>
            {[1024, 1280, 1440].map((value) => <option key={value} value={value}>{value}px</option>)}
          </select></label>
          <button type="button" aria-label={`Switch to ${dark ? "light" : "dark"} previews`} onClick={() => setDark((value) => !value)}>
            {dark ? <SunIcon /> : <MoonIcon />}{dark ? "Light" : "Dark"}
          </button>
        </Toolbar>
        <Status role="status" aria-live="polite">{notice}</Status>
        <Gallery>
          {designs.map((design) => <Option key={design.id} id={`banner-option-${design.id}`} data-banner-option={design.id}>
            <header>
              <span data-number aria-hidden="true">{String(design.id).padStart(2, "0")}</span>
              <DesignHeading>
                <h2>{design.name}{design.id === 1 && <span data-recommended>Selected · Applied</span>}</h2>
                <p>{design.description}</p>
              </DesignHeading>
              <Shortlist type="button" aria-pressed={shortlisted === design.id} aria-label={`Shortlist ${design.name}`} onClick={() => {
                const next = shortlisted === design.id ? null : design.id;
                setShortlisted(next);
                setNotice(next ? `Shortlisted for review: ${String(design.id).padStart(2, "0")} · ${design.name}. Option 01 remains applied on desktop.` : "Shortlist cleared. Option 01 remains applied on desktop.");
              }}>{shortlisted === design.id ? "Shortlisted" : "Shortlist"}</Shortlist>
            </header>
            <StateGroup>
              {states.map((item) => <div key={item.id}>
                <Label><strong>{item.label}</strong><span>{width}px desktop · {design.height}px banner</span></Label>
                <Viewport role="region" aria-label={`${design.name}, ${item.label}, desktop preview`} tabIndex={0}>
                  <Canvas $width={width}>
                    <BannerSample design={design} state={item.id} onAction={(label) => setNotice(`${label} · Preview only; no account or payment action was taken.`)} />
                  </Canvas>
                </Viewport>
              </div>)}
            </StateGroup>
          </Option>)}
        </Gallery>
        <Footer>Option 01 is applied on desktop with current plan pricing and real session status. The samples use an illustrative UGX 1,000 offer. Shortlisting records a review preference only. <a href={`/${resolveLocale(locale)}`}>Return to app</a></Footer>
      </Content>
    </Review>
  </ThemeProvider>;
}
