/** Successful administrator sign-in starts with payments awaiting review. */
export const adminLandingPath = "/admin/payments";

/** Fixed destinations shared by the admin page switcher and its no-script fallback. */
export const adminSections = [
  { key: "overview", href: "/admin", label: "Overview" },
  { key: "payments", href: "/admin/payments", label: "Payments", layout: "record" },
  { key: "codes", href: "/admin/codes", label: "Codes", layout: "record" },
  { key: "subscribers", href: "/admin/subscribers", label: "Subscribers", layout: "record" },
  { key: "referrals", href: "/admin/referrals", label: "Referral review", layout: "record" },
  { key: "plans", href: "/admin/plans", label: "Plans", layout: "record" },
  { key: "audit", href: "/admin/audit", label: "Audit", layout: "record" },
  { key: "settings", href: "/admin/settings", label: "Settings" },
  { key: "forecasts", href: "/admin/forecasts", label: "Forecast sources" },
  { key: "analytics", href: "/analytics", label: "Analytics" },
] as const;

export type AdminSection = (typeof adminSections)[number]["key"];

/** The viewport-bound list/detail pattern is reserved for individual record workflows. */
export const isRecordAdminSection = (section: AdminSection): boolean => adminSections.some(item => item.key === section && "layout" in item && item.layout === "record");
