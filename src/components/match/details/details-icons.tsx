"use client";

import type { ReactNode, SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children">;

/** Decorative 24px stroke icons for the match-details sections; visible text carries meaning. */
function Icon({ children, ...props }: IconProps & { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{children}</svg>;
}

export const MarketsIcon = (props: IconProps) => <Icon strokeWidth={2.5} {...props}><path d="M5 20v-6M10 20V9M15 20v-8M20 20V4" /></Icon>;
export const CompareIcon = (props: IconProps) => <Icon {...props}><path d="M4 7h7M4 12h11M4 17h5M13 7h7M17 12h3M11 17h9" /></Icon>;
export const HeadToHeadIcon = (props: IconProps) => <Icon {...props}>
  <circle cx="8" cy="8" r="3" /><circle cx="16" cy="8" r="3" /><path d="M2.5 19a5.5 5.5 0 0 1 11 0M10.5 19a5.5 5.5 0 0 1 11 0" />
</Icon>;
export const FormIcon = (props: IconProps) => <Icon {...props}><path d="M3 17l5-5 4 3 6-7 3 3" /><path d="M18 8h3v3" /></Icon>;
export const LineupIcon = (props: IconProps) => <Icon {...props}>
  <rect x="3" y="4" width="18" height="16" rx="1" /><path d="M12 4v16" /><circle cx="12" cy="12" r="2.5" /><path d="M3 9h3v6H3M21 9h-3v6h3" />
</Icon>;
export const PlayerIcon = (props: IconProps) => <Icon {...props}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Icon>;
export const NewsIcon = (props: IconProps) => <Icon {...props}>
  <path d="M5 4h11v16H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1Z" /><path d="M16 8h3a1 1 0 0 1 1 1v9a2 2 0 0 1-4 0M8 8h5M8 12h5M8 16h3" />
</Icon>;
export const InjuryIcon = (props: IconProps) => <Icon strokeWidth={2.5} {...props}><path d="M12 5v14M5 12h14" /></Icon>;
export const ContextIcon = (props: IconProps) => <Icon {...props}>
  <path d="M3 10c0-2 4-4 9-4s9 2 9 4v6c0 2-4 4-9 4s-9-2-9-4v-6Z" /><path d="M3 10c0 2 4 4 9 4s9-2 9-4" />
</Icon>;
export const RefereeIcon = (props: IconProps) => <Icon {...props}>
  <path d="M3 10h9l4-3h5v4l-3 2v2a5 5 0 1 1-10 0v-1H3z" /><circle cx="13" cy="15" r="1" />
</Icon>;
export const HistoryIcon = (props: IconProps) => <Icon {...props}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></Icon>;
export const StarIcon = (props: IconProps) => <Icon fill="currentColor" strokeWidth={1.5} {...props}>
  <path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8L12 3Z" />
</Icon>;
export const ResultIcon = (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /></Icon>;
export const ShieldIcon = (props: IconProps) => <Icon {...props}><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" /></Icon>;
export const GoalsIcon = (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="m12 7 4 3-1.5 4.5h-5L8 10l4-3Z" /></Icon>;
export const BothTeamsIcon = (props: IconProps) => <Icon {...props}><circle cx="7" cy="12" r="4" /><circle cx="17" cy="12" r="4" /><path d="M11 12h2" /></Icon>;
export const ExternalIcon = (props: IconProps) => <Icon {...props}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></Icon>;
export const BackIcon = (props: IconProps) => <Icon strokeWidth={2.25} {...props}><path d="m15 6-6 6 6 6" /></Icon>;
