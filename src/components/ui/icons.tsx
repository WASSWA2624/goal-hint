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
export const MoonIcon = (props: IconProps) => <Icon {...props}><path d="M20.5 14a8.5 8.5 0 0 1-10.5-10.5A8.5 8.5 0 1 0 20.5 14Z" /></Icon>;
export const SunIcon = (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>;
export const CloseIcon = (props: IconProps) => <Icon {...props}><path d="M6 6l12 12M18 6 6 18" /></Icon>;
export const ChevronDownIcon = (props: IconProps) => <Icon {...props}><path d="m6 9 6 6 6-6" /></Icon>;
export const ChevronLeftIcon = (props: IconProps) => <Icon {...props}><path d="m15 6-6 6 6 6" /></Icon>;
export const ChevronRightIcon = (props: IconProps) => <Icon {...props}><path d="m9 6 6 6-6 6" /></Icon>;
export const ArrowRightIcon = (props: IconProps) => <Icon {...props}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const CalendarIcon = (props: IconProps) => <Icon {...props}><rect x="3" y="5" width="18" height="16" /><path d="M7 3v4M17 3v4M3 11h18" /></Icon>;
export const SlidersIcon = (props: IconProps) => <Icon {...props}><path d="M4 7h4M12 7h8M4 17h8M16 17h4M8 4v6M16 14v6" /></Icon>;
export const FilterIcon = (props: IconProps) => <Icon {...props}><path d="M4 5h16l-6.5 7.5V19l-3 1.5v-8L4 5Z" /></Icon>;
export const ResetIcon = (props: IconProps) => <Icon {...props}><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" /></Icon>;
export const InfoIcon = (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5h.01" /></Icon>;
export const HelpIcon = (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 1.5-2.5 2-2.5 3.5M12 16.5h.01" /></Icon>;
export const ShieldIcon = (props: IconProps) => <Icon {...props}><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" /></Icon>;
export const DocumentIcon = (props: IconProps) => <Icon {...props}><path d="M14 3H5v18h14V8l-5-5ZM14 3v5h5M8 12h8M8 16h8" /></Icon>;
export const MailIcon = (props: IconProps) => <Icon {...props}><rect x="3" y="5" width="18" height="14" /><path d="m3 6 9 7 9-7" /></Icon>;
export const HomeIcon = (props: IconProps) => <Icon {...props}><path d="M4 11.5 12 5l8 6.5V20h-5v-5H9v5H4v-8.5Z" /></Icon>;
export const LiveIcon = (props: IconProps) => <Icon {...props}>
  <circle cx="12" cy="12" r="2.5" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 16.2a6 6 0 0 0 0-8.4M5 5a10 10 0 0 0 0 14M19 19a10 10 0 0 0 0-14" />
</Icon>;
/** Finished matches: a completed check. */
export const ResultsIcon = (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.75 2.75L16.5 9.5" /></Icon>;
/** A selection slip: square paper with compact checked rows. */
export const SlipIcon = (props: IconProps) => <Icon {...props}><path d="M5 3h14v18H5zM8 8h.01M11 8h5M8 12h.01M11 12h5M8 16h.01M11 16h5" /></Icon>;
export const MoreIcon = (props: IconProps) => <Icon {...props}><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></Icon>;
