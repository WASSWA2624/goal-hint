"use client";

import { useState } from "react";
import styled, { ThemeProvider } from "styled-components";
import { MoonIcon, SunIcon } from "@/components/ui/icons";
import { Canvas, Content, Footer, Gallery, Intro, Label, Option, Review, Status, Toolbar, Viewport } from "@/components/navigation/header-review/gallery-styles";
import { resolveLocale } from "@/i18n/locales";
import { darkTheme, lightTheme } from "@/styles/theme";
import { bannerReviewStates, type BannerReviewState } from "./designs";
import { mobileBannerReviewDesigns } from "./mobile-designs";
import { MobileBannerSample } from "./mobile-banner-sample";

const StateGrid = styled.div<{ $width: number }>`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, ${({ $width }) => $width + 2}px), 1fr));
  align-items: start;
  gap: 16px 12px;
  > div { min-inline-size: 0; }
`;
const DesignHeading = styled.div`
  flex: 1;
  min-inline-size: 0;
`;
const Shortlist = styled.button`
  flex: none;
  min-block-size: 44px;
  padding: 6px 10px;
  border: 1px solid ${({ theme }) => theme.color.buttonBorder};
  color: ${({ theme }) => theme.color.link};
  background: ${({ theme }) => theme.color.surface};
  cursor: pointer;
  &[aria-pressed="true"] { color: ${({ theme }) => theme.color.onBrand}; background: ${({ theme }) => theme.color.brand}; }
`;

export function MobileBannerDesignGallery({ locale }: { locale: string }) {
  const [dark, setDark] = useState(false);
  const [option, setOption] = useState(0);
  const [state, setState] = useState<BannerReviewState | "all">("all");
  const [width, setWidth] = useState(390);
  const [shortlisted, setShortlisted] = useState<number | null>(null);
  const [notice, setNotice] = useState("Ten mobile concepts · Three account states each · No mobile design has been applied.");
  const designs = option ? mobileBannerReviewDesigns.filter((design) => design.id === option) : mobileBannerReviewDesigns;
  const states = state === "all" ? bannerReviewStates : bannerReviewStates.filter((item) => item.id === state);
  const toggleTheme = () => setDark((value) => !value);

  return <ThemeProvider theme={dark ? darkTheme : lightTheme}>
    <Review data-mobile-banner-review data-review-theme={dark ? "dark" : "light"}>
      <Content>
        <Intro>
          <span>Goal Hint · Mobile banner review</span>
          <h1>A clear next step. Made for a small screen.</h1>
          <p>Ten mobile banner options beneath the same app header, each shown for visitors, members without a subscription, and active subscribers. The approved desktop banner and the live mobile banner stay unchanged while you choose.</p>
        </Intro>
        <Toolbar aria-label="Mobile banner preview settings">
          <label><span>Design</span><select aria-label="Design option" value={option} onChange={(event) => setOption(Number(event.target.value))}>
            <option value={0}>All 10 designs</option>
            {mobileBannerReviewDesigns.map((design) => <option key={design.id} value={design.id}>{String(design.id).padStart(2, "0")} · {design.name}</option>)}
          </select></label>
          <label><span>Account state</span><select aria-label="Account state" value={state} onChange={(event) => setState(event.target.value as BannerReviewState | "all")}>
            <option value="all">All three states</option>
            {bannerReviewStates.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select></label>
          <label><span>Phone width</span><select aria-label="Mobile preview width" value={width} onChange={(event) => setWidth(Number(event.target.value))}>
            {[320, 360, 390, 430].map((value) => <option key={value} value={value}>{value}px</option>)}
          </select></label>
          <button type="button" aria-label={`Switch to ${dark ? "light" : "dark"} previews`} onClick={toggleTheme}>
            {dark ? <SunIcon /> : <MoonIcon />}{dark ? "Light" : "Dark"}
          </button>
        </Toolbar>
        <Status role="status" aria-live="polite">{notice}</Status>
        <Gallery>
          {designs.map((design) => <Option key={design.id} id={`mobile-banner-option-${design.id}`} data-mobile-banner-option={design.id}>
            <header>
              <span data-number aria-hidden="true">{String(design.id).padStart(2, "0")}</span>
              <DesignHeading>
                <h2>{design.name}{"recommended" in design && design.recommended && <span data-recommended>Recommended</span>}</h2>
                <p>{design.description}</p>
              </DesignHeading>
              <Shortlist type="button" aria-pressed={shortlisted === design.id} aria-label={`Shortlist ${design.name}`} onClick={() => {
                const next = shortlisted === design.id ? null : design.id;
                setShortlisted(next);
                setNotice(next ? `Shortlisted: ${String(design.id).padStart(2, "0")} · ${design.name}. Tell me this number or name to choose it. Both live banners are unchanged.` : "Shortlist cleared. No mobile design has been applied.");
              }}>{shortlisted === design.id ? "Shortlisted" : "Shortlist"}</Shortlist>
            </header>
            <StateGrid $width={width}>
              {states.map((item) => <div key={item.id}>
                <Label style={{ maxWidth: width + 2 }}><strong>{item.label}</strong><span>{width}px</span></Label>
                <Viewport role="region" aria-label={`${design.name}, ${item.label}, mobile preview; scroll horizontally if needed`} tabIndex={0} style={{ maxWidth: width + 2 }}>
                  <Canvas $width={width}>
                    <MobileBannerSample design={design} state={item.id} dark={dark} onTheme={toggleTheme}
                      onAction={(label) => setNotice(`${label} · Preview only; no account or payment action was taken.`)} />
                  </Canvas>
                </Viewport>
              </div>)}
            </StateGrid>
          </Option>)}
        </Gallery>
        <Footer>The samples use an illustrative UGX 1,000 offer and account states. Shortlisting records a review preference only. Desktop Inline invitation and the live mobile banner are unchanged. <a href={`/${resolveLocale(locale)}`}>Return to app</a></Footer>
      </Content>
    </Review>
  </ThemeProvider>;
}
