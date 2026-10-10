"use client";

import type { ReactNode, SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children">;

/** Decorative 24px stroke icons; adjacent text or hidden labels carry meaning. */
function Icon({ children, ...props }: IconProps & { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{children}</svg>;
}

export const TrophyIcon = (props: IconProps) => <Icon {...props}>
  <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
  <path d="M17 6h2.5a1.5 1.5 0 0 1 1.5 1.5V8a4 4 0 0 1-4 4M7 6H4.5A1.5 1.5 0 0 0 3 7.5V8a4 4 0 0 0 4 4" />
</Icon>;

export const CalendarIcon = (props: IconProps) => <Icon {...props}>
  <rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" />
</Icon>;

export const ClockIcon = (props: IconProps) => <Icon {...props}>
  <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
</Icon>;

export const BallIcon = (props: IconProps) => <Icon {...props}>
  <circle cx="12" cy="12" r="9" />
  <path d="m12 7.5 4 2.9-1.5 4.7h-5L8 10.4l4-2.9ZM12 3v4.5M21 10.4l-5 0M17.5 19.5l-3-4.4M6.5 19.5l3-4.4M3 10.4h5" />
</Icon>;

export const BarsIcon = (props: IconProps) => <Icon strokeWidth={2.5} {...props}><path d="M6 20v-6M12 20V8M18 20V4" /></Icon>;

export const LockIcon = (props: IconProps) => <Icon {...props}>
  <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
</Icon>;

export const ChevronIcon = (props: IconProps) => <Icon strokeWidth={2.25} {...props}><path d="m9 6 6 6-6 6" /></Icon>;

export const CheckIcon = (props: IconProps) => <Icon strokeWidth={3} {...props}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>;

export const CrossIcon = (props: IconProps) => <Icon strokeWidth={3} {...props}><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></Icon>;

export const VoidIcon = (props: IconProps) => <Icon strokeWidth={2.5} {...props}><circle cx="12" cy="12" r="8" /><path d="m6.5 17.5 11-11" /></Icon>;

export const NoticeIcon = (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5h.01" /></Icon>;
