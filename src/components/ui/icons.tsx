import type { ReactNode, SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children">;

/**
 * Decorative 24px stroke icons; adjacent text or accessible names carry meaning.
 * A shared module (no "use client"): Server Components render plain SVG instead of client references.
 */
function Icon({ children, ...props }: IconProps & { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{children}</svg>;
}

export const SearchIcon = (props: IconProps) => <Icon {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>;
export const CloseIcon = (props: IconProps) => <Icon {...props}><path d="M6 6l12 12M18 6 6 18" /></Icon>;
export const ChevronDownIcon = (props: IconProps) => <Icon {...props}><path d="m6 9 6 6 6-6" /></Icon>;
export const ChevronLeftIcon = (props: IconProps) => <Icon {...props}><path d="m15 6-6 6 6 6" /></Icon>;
export const ChevronRightIcon = (props: IconProps) => <Icon {...props}><path d="m9 6 6 6-6 6" /></Icon>;
export const ArrowRightIcon = (props: IconProps) => <Icon {...props}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const SortIcon = (props: IconProps) => <Icon {...props}><path d="M7 4v16M3.5 7.5 7 4l3.5 3.5M17 20V4M13.5 16.5 17 20l3.5-3.5" /></Icon>;
export const FilterIcon = (props: IconProps) => <Icon {...props}><path d="M4 5h16l-6.5 7.5V19l-3 1.5v-8L4 5Z" /></Icon>;
export const ResetIcon = (props: IconProps) => <Icon {...props}><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" /></Icon>;
export const InfoIcon = (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5h.01" /></Icon>;
export const HomeIcon = (props: IconProps) => <Icon {...props}><path d="M4 11.5 12 5l8 6.5V20h-5v-5H9v5H4v-8.5Z" /></Icon>;
export const LiveIcon = (props: IconProps) => <Icon {...props}>
  <circle cx="12" cy="12" r="2.5" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 16.2a6 6 0 0 0 0-8.4M5 5a10 10 0 0 0 0 14M19 19a10 10 0 0 0 0-14" />
</Icon>;
/** Finished matches: a completed check. */
export const ResultsIcon = (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.75 2.75L16.5 9.5" /></Icon>;
/** Performance statistics: a rising line chart. */
export const StatsIcon = (props: IconProps) => <Icon {...props}><path d="M4 4v16h16M7.5 14.5l3.5-3.5 3 3 5-5.5" /><path d="M15 8.5h4v4" /></Icon>;
export const MoreIcon = (props: IconProps) => <Icon {...props}><circle cx="5" cy="12" r="1.25" /><circle cx="12" cy="12" r="1.25" /><circle cx="19" cy="12" r="1.25" /></Icon>;
