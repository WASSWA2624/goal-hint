export type HeaderReviewVariant =
  | "balanced"
  | "slim"
  | "comfortable"
  | "quiet"
  | "divided"
  | "joined"
  | "outlined"
  | "contrast"
  | "centered"
  | "underlined";

export type HeaderReviewDesign = Readonly<{
  id: number;
  variant: HeaderReviewVariant;
  name: string;
  description: string;
  desktopHeight: number;
  mobileHeight: number;
  controlHeight: number;
  brandHeight: number;
  gap: number;
  recommended?: boolean;
}>;

/** Review-only specifications; no selection changes the production header. */
export const headerReviewDesigns: readonly HeaderReviewDesign[] = [
  {
    id: 1,
    variant: "balanced",
    name: "Balanced",
    description: "The familiar layout with aligned branding, compact filled utilities and even spacing.",
    desktopHeight: 48,
    mobileHeight: 48,
    controlHeight: 32,
    brandHeight: 24,
    gap: 6,
    recommended: true,
  },
  {
    id: 2,
    variant: "slim",
    name: "Slim",
    description: "The shortest desktop rail, with smaller controls; mobile uses flat actions with comfortable touch targets.",
    desktopHeight: 44,
    mobileHeight: 48,
    controlHeight: 28,
    brandHeight: 22,
    gap: 4,
  },
  {
    id: 3,
    variant: "comfortable",
    name: "Comfortable",
    description: "A little more breathing room around larger controls while remaining shorter than the current desktop header.",
    desktopHeight: 52,
    mobileHeight: 52,
    controlHeight: 36,
    brandHeight: 24,
    gap: 8,
  },
  {
    id: 4,
    variant: "quiet",
    name: "Quiet controls",
    description: "Flat theme and account actions reduce visual weight while the primary action stays easy to find.",
    desktopHeight: 48,
    mobileHeight: 48,
    controlHeight: 32,
    brandHeight: 24,
    gap: 6,
  },
  {
    id: 5,
    variant: "divided",
    name: "Divided groups",
    description: "Fine vertical separators distinguish the brand, navigation and account tools without adding another row.",
    desktopHeight: 50,
    mobileHeight: 48,
    controlHeight: 32,
    brandHeight: 24,
    gap: 8,
  },
  {
    id: 6,
    variant: "joined",
    name: "Joined toolbar",
    description: "Square action cells share borders in one compact toolbar, keeping theme and account tools together.",
    desktopHeight: 48,
    mobileHeight: 48,
    controlHeight: 32,
    brandHeight: 24,
    gap: 0,
  },
  {
    id: 7,
    variant: "outlined",
    name: "Matching outlines",
    description: "Consistent thin outlines give payment, authentication, theme and account controls the same clear shape.",
    desktopHeight: 48,
    mobileHeight: 48,
    controlHeight: 32,
    brandHeight: 24,
    gap: 6,
  },
  {
    id: 8,
    variant: "contrast",
    name: "Action emphasis",
    description: "Accent-filled payment or sign-up actions stand out beside subtly tinted theme and account controls.",
    desktopHeight: 48,
    mobileHeight: 48,
    controlHeight: 32,
    brandHeight: 24,
    gap: 6,
  },
  {
    id: 9,
    variant: "centered",
    name: "Centered navigation",
    description: "Centered desktop destinations and a continuous, softly filled mobile utility group keep each row balanced.",
    desktopHeight: 50,
    mobileHeight: 48,
    controlHeight: 32,
    brandHeight: 24,
    gap: 6,
  },
  {
    id: 10,
    variant: "underlined",
    name: "Underlined actions",
    description: "Text actions use a fine lower rule instead of a button box, paired with quiet square utility controls.",
    desktopHeight: 48,
    mobileHeight: 48,
    controlHeight: 32,
    brandHeight: 24,
    gap: 6,
  },
];
