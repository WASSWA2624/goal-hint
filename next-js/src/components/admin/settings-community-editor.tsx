"use client";

import { communityDestinations, communityLinksWithDefaults, type CommunityLink } from "@/domain/community";
import { FieldBlock, FieldError } from "./admin-form";
import { CommunityIcon } from "@/components/ui/community-icon";
import { ContactList, ContactOptions, ContactRow, FeatureBody, FeatureHeading } from "./settings-feature-styles";

export function SettingsCommunityEditor({ value, visible, onChange, onVisibleChange, disabled, error, visibilityError }: {
  value: readonly CommunityLink[]; visible: boolean; onChange: (links: readonly CommunityLink[]) => void;
  onVisibleChange: (visible: boolean) => void; disabled: boolean; error?: string | undefined; visibilityError?: string | undefined;
}) {
  const links = communityLinksWithDefaults(value);
  return <FeatureBody data-community-settings><FeatureHeading><div><p>Visitors can open these channels without an account.</p></div></FeatureHeading>
    <ContactOptions><label><input id="setting-communityVisible" type="checkbox" checked={visible} disabled={disabled}
      aria-invalid={visibilityError ? true : undefined} aria-describedby={visibilityError ? "setting-communityVisible-error" : undefined}
      onChange={event => onVisibleChange(event.target.checked)} />Show Community to the public</label></ContactOptions>
    {visibilityError && <FieldError id="setting-communityVisible-error" role="alert">{visibilityError}</FieldError>}
    <p id="setting-communityLinks-hint">Channels without a link show “Coming soon”. Add a link to let visitors open your group, channel or profile.</p>
    {error && <FieldError id="setting-communityLinks-error" role="alert">{error}</FieldError>}
    <ContactList>{communityDestinations.map((destination, index) => {
      const link = links.find(link => link.type === destination.type) ?? { type: destination.type, url: "", enabled: true };
      const change = (patch: Partial<CommunityLink>) => onChange(links.map(item => item.type === link.type ? { ...item, ...patch } : item));
      return <ContactRow key={link.type} data-community-type={link.type} aria-label={`${destination.label} settings`}><FieldBlock label={`${destination.label} link`} leading={<CommunityIcon type={link.type} />}>
        <input id={index === 0 ? "setting-communityLinks" : `setting-community-${link.type}`} type="url" inputMode="url" autoComplete="off" spellCheck={false} maxLength={512}
          aria-invalid={error ? true : undefined} aria-describedby={`setting-communityLinks-hint${error ? " setting-communityLinks-error" : ""}`}
          value={link.url} disabled={disabled} onChange={event => change({ url: event.target.value })} /></FieldBlock>
        <ContactOptions><label><input id={`setting-community-${link.type}-visible`} type="checkbox" checked={link.enabled} disabled={disabled}
          aria-label={`Show ${destination.label} to the public`} onChange={event => change({ enabled: event.target.checked })} />Show to the public</label></ContactOptions>
      </ContactRow>;
    })}</ContactList>
  </FeatureBody>;
}
