"use client";

import { useState } from "react";
import { ThemeProvider } from "styled-components";
import { MoonIcon, SunIcon } from "@/components/ui/icons";
import { darkTheme, lightTheme } from "@/styles/theme";
import { resolveLocale } from "@/i18n/locales";
import { headerReviewDesigns } from "./designs";
import { HeaderSample, type HeaderReviewSession } from "./header-sample";
import { Canvas, Content, Footer, Gallery, Intro, Label, MobileRow, Option, Review, Spec, Status, Toolbar, Viewport } from "./gallery-styles";

export function HeaderDesignGallery({ locale }: { locale: string }) {
  const [dark, setDark] = useState(false);
  const [session, setSession] = useState<HeaderReviewSession>("admin");
  const [mobileWidth, setMobileWidth] = useState(390);
  const [desktopWidth, setDesktopWidth] = useState(1280);
  const [option, setOption] = useState(0);
  const [notice, setNotice] = useState("Selected: 04 · Quiet controls. Applied to the shared mobile and desktop headers.");
  const toggleTheme = () => setDark((value) => !value);
  const designs = option ? headerReviewDesigns.filter((design) => design.id === option) : headerReviewDesigns;

  return <ThemeProvider theme={dark ? darkTheme : lightTheme}>
    <Review data-header-review data-review-theme={dark ? "dark" : "light"}>
      <Content>
        <Intro>
          <span>Goal Hint · Header design review</span>
          <h1>Same identity. More room for the app.</h1>
          <p>Ten compact header options, each shown on desktop and mobile. Every option aligns the original logo symbol and app name to the same visible height, with square controls and a single header row.</p>
        </Intro>
        <Toolbar aria-label="Header preview settings">
          <label><span>Compare</span><select aria-label="Design option" value={option} onChange={(event) => setOption(Number(event.target.value))}>
            <option value={0}>All 10 options</option>
            {headerReviewDesigns.map((design) => <option key={design.id} value={design.id}>{String(design.id).padStart(2, "0")} · {design.name}</option>)}
          </select></label>
          <label><span>Account state</span><select aria-label="Account state" value={session} onChange={(event) => setSession(event.target.value as HeaderReviewSession)}>
            <option value="guest">Guest · Login / Register</option><option value="member">Member · Account</option><option value="admin">Admin · Payments / Account</option>
          </select></label>
          <label><span>Mobile width</span><select aria-label="Mobile preview width" value={mobileWidth} onChange={(event) => setMobileWidth(Number(event.target.value))}>
            {[320, 360, 390, 430].map((width) => <option key={width} value={width}>{width}px</option>)}
          </select></label>
          <label><span>Desktop width</span><select aria-label="Desktop preview width" value={desktopWidth} onChange={(event) => setDesktopWidth(Number(event.target.value))}>
            {[1024, 1280].map((width) => <option key={width} value={width}>{width}px</option>)}
          </select></label>
          <button type="button" aria-label={`Switch to ${dark ? "light" : "dark"} previews`} onClick={toggleTheme}>{dark ? <SunIcon /> : <MoonIcon />}{dark ? "Light" : "Dark"}</button>
        </Toolbar>
        <Status role="status" aria-live="polite">{notice}</Status>
        <Gallery>
          {designs.map((design) => <Option key={design.id} id={`option-${design.id}`} data-header-option={design.id}>
            <header><span data-number aria-hidden="true">{String(design.id).padStart(2, "0")}</span><div>
              <h2>{design.name}{design.id === 4 && <span data-recommended>Selected · Applied</span>}</h2>
              <p>{design.description}</p>
            </div></header>
            <Label><strong>Desktop · {desktopWidth}px</strong><span>{design.desktopHeight}px header · {design.controlHeight}px controls</span></Label>
            <Viewport role="region" aria-label={`${design.name} desktop canvas, scroll horizontally on smaller screens`} tabIndex={0}>
              <Canvas $width={desktopWidth}><HeaderSample design={design} device="desktop" session={session} dark={dark} onTheme={toggleTheme} onPreview={setNotice} /></Canvas>
            </Viewport>
            <MobileRow><div>
              <Label><strong>Mobile · {mobileWidth}px</strong><span>{design.mobileHeight}px header · 44px tap targets</span></Label>
              <Viewport role="region" aria-label={`${design.name} mobile canvas`} tabIndex={0} style={{ maxWidth: mobileWidth + 2 }}>
                <Canvas $width={mobileWidth}><HeaderSample design={design} device="mobile" session={session} dark={dark} onTheme={toggleTheme} onPreview={setNotice} /></Canvas>
              </Viewport>
            </div><Spec aria-label={`${design.name} dimensions`}>
              <div><dt>Logo + name</dt><dd>{design.brandHeight}px desktop / 20px mobile</dd></div>
              <div><dt>Desktop space saved</dt><dd>~{Math.round(67 - design.desktopHeight)}px per screen</dd></div>
              <div><dt>Mobile navigation</dt><dd>Existing bottom tabs retained</dd></div>
            </Spec></MobileRow>
          </Option>)}
        </Gallery>
        <Footer>Option 04, Quiet controls, is applied to the app. Preview accounts and payment counts are illustrative; Subscribe and access status remain separate from the header. <a href={`/${resolveLocale(locale)}`}>Return to app</a></Footer>
      </Content>
    </Review>
  </ThemeProvider>;
}
