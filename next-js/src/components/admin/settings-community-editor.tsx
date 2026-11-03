"use client";

import { communityDestinations, type CommunityLink } from "@/domain/community";
import { FieldBlock, FieldError } from "./admin-form";
import { CommunityIcon } from "@/components/ui/community-icon";
import { ContactList, ContactOptions, ContactRow, FeatureBody, FeatureHeading } from "./settings-feature-styles";

export function SettingsCommunityEditor({ value, onChange, disabled, error }: {
  value: readonly CommunityLink[]; onChange: (links: readonly CommunityLink[]) => void; disabled: boolean; error?: string | undefined;
}) {
  return <FeatureBody data-community-settings><FeatureHeading><div><h2>Community</h2><p>Public links in More. Empty or disabled destinations stay hidden.</p></div></FeatureHeading>
    {error && <FieldError role="alert">{error}</FieldError>}
    <ContactList>{communityDestinations.map(destination => {
      const link = value.find(link => link.type === destination.type) ?? { type: destination.type, url: "", enabled: false };
      const change = (patch: Partial<CommunityLink>) => onChange([...value.filter(item => item.type !== link.type), { ...link, ...patch }]);
      return <ContactRow key={link.type}><FieldBlock label={destination.label} leading={<CommunityIcon type={link.type} />}><input type="url" inputMode="url" autoComplete="off" maxLength={512}
        value={link.url} disabled={disabled} onChange={event => change({ url: event.target.value })} /></FieldBlock>
        <ContactOptions><label><input type="checkbox" checked={link.enabled} disabled={disabled} onChange={event => change({ enabled: event.target.checked })} />Show link</label></ContactOptions>
      </ContactRow>;
    })}</ContactList>
  </FeatureBody>;
}
