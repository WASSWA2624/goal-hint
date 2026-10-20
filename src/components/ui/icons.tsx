import type { ReactNode, SVGProps } from "react";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children">;

/**
 * Decorative 24px stroke icons; adjacent text or accessible names carry meaning.
 * A shared module (no "use client"): Server Components render plain SVG instead of client references.
 */
export function Icon({ children, ...props }: IconProps & { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{children}</svg>;
}

export const UserIcon = (props: IconProps) => <Icon {...props}><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></Icon>;
export const GlobeIcon = (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></Icon>;
export const SubscriberIcon = (props: IconProps) => <Icon {...props}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" /></Icon>;
export const SearchIcon = (props: IconProps) => <Icon {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>;
export const MoonIcon = (props: IconProps) => <Icon {...props}><path d="M20.5 14a8.5 8.5 0 0 1-10.5-10.5A8.5 8.5 0 1 0 20.5 14Z" /></Icon>;
export const SunIcon = (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>;
export const CloseIcon = (props: IconProps) => <Icon {...props}><path d="M6 6l12 12M18 6 6 18" /></Icon>;
export const ChevronDownIcon = (props: IconProps) => <Icon {...props}><path d="m6 9 6 6 6-6" /></Icon>;
export const ChevronLeftIcon = (props: IconProps) => <Icon {...props}><path d="m15 6-6 6 6 6" /></Icon>;
export const ChevronRightIcon = (props: IconProps) => <Icon {...props}><path d="m9 6 6 6-6 6" /></Icon>;
/** "Go to start/end": a chevron against a bar, for first and last page controls. */
export const FirstPageIcon = (props: IconProps) => <Icon {...props}><path d="M7 6v12M17 6l-6 6 6 6" /></Icon>;
export const LastPageIcon = (props: IconProps) => <Icon {...props}><path d="M17 6v12M7 6l6 6-6 6" /></Icon>;
export const CalendarIcon = (props: IconProps) => <Icon {...props}><rect x="3" y="5" width="18" height="16" /><path d="M7 3v4M17 3v4M3 11h18" /></Icon>;
export const SlidersIcon = (props: IconProps) => <Icon {...props}><path d="M4 7h4M12 7h8M4 17h8M16 17h4M8 4v6M16 14v6" /></Icon>;
export const CheckIcon = (props: IconProps) => <Icon {...props}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>;
export const SortIcon = (props: IconProps) => <Icon {...props}><path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5" /></Icon>;
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
/** Get access page: copy a wallet number, call/chat for help, paste an SMS, attach a screenshot. */
export const CopyIcon = (props: IconProps) => <Icon {...props}><rect x="9" y="9" width="12" height="12" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></Icon>;
export const PhoneIcon = (props: IconProps) => <Icon {...props}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" /></Icon>;
export const ChatIcon = (props: IconProps) => <Icon {...props}><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5Z" /></Icon>;
export const ClipboardIcon = (props: IconProps) => <Icon {...props}><rect x="8" y="2" width="8" height="4" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></Icon>;
export const ImageIcon = (props: IconProps) => <Icon {...props}><rect x="3" y="3" width="18" height="18" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></Icon>;
export const GiftIcon = (props: IconProps) => <Icon {...props}><rect x="3" y="8" width="18" height="4" /><path d="M12 8v13M19 12v9H5v-9M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" /></Icon>;
export const SignOutIcon = (props: IconProps) => <Icon {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></Icon>;
export const SignInIcon = (props: IconProps) => <Icon {...props}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" /></Icon>;
export const UserPlusIcon = (props: IconProps) => <Icon {...props}><circle cx="9" cy="8" r="4" /><path d="M2 21v-2a7 7 0 0 1 14 0v2M19 8v6M16 11h6" /></Icon>;
export const DialpadIcon = (props: IconProps) => <Icon {...props}><path d="M6 5h.01M12 5h.01M18 5h.01M6 11h.01M12 11h.01M18 11h.01M6 17h.01M12 17h.01M18 17h.01" strokeWidth={3} /></Icon>;
export const LockIcon = (props: IconProps) => <Icon {...props}><rect x="4" y="11" width="16" height="10" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Icon>;
export const KeyIcon = (props: IconProps) => <Icon {...props}><circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" /></Icon>;
