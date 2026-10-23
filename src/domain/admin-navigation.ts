/** Fixed destinations shared by the admin page switcher and its no-script fallback. */
export const adminSections = [
  { key: "overview", href: "/admin", label: "Overview" },
  { key: "payments", href: "/admin/payments", label: "Payments" },
  { key: "codes", href: "/admin/codes", label: "Codes" },
  { key: "subscribers", href: "/admin/subscribers", label: "Subscribers" },
  { key: "password-resets", href: "/admin/password-resets", label: "Password requests" },
  { key: "plans", href: "/admin/plans", label: "Plans" },
  { key: "settings", href: "/admin/settings", label: "Settings" },
  { key: "audit", href: "/admin/audit", label: "Audit" },
  { key: "analytics", href: "/analytics", label: "Analytics" },
] as const;

export type AdminSection = (typeof adminSections)[number]["key"];
