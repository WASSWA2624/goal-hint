export type MobileBannerReviewDesign = Readonly<{
  id: number;
  name: string;
  description: string;
  variant: "inline" | "stacked" | "split" | "rule" | "price" | "contrast" | "editorial" | "steps" | "edge" | "quiet";
  recommended?: boolean;
}>;

export const mobileBannerReviewDesigns = [
  { id: 1, name: "Inline invitation", variant: "inline", recommended: true,
    description: "A short inline invitation with the account actions and entry price in one row." },
  { id: 2, name: "Lead and links", variant: "stacked",
    description: "A brief lead and text actions share a single, uncluttered line." },
  { id: 3, name: "Split action", variant: "split",
    description: "The offer stays on the left and the next action sits at the right edge." },
  { id: 4, name: "Accent rule", variant: "rule",
    description: "A slim vertical rule anchors one concise line of copy and actions." },
  { id: 5, name: "Price first", variant: "price",
    description: "The entry price anchors the offer. Active access takes its place for subscribers." },
  { id: 6, name: "Contrast strip", variant: "contrast",
    description: "A narrow brand-colored strip gives the invitation stronger emphasis." },
  { id: 7, name: "Editorial line", variant: "editorial",
    description: "A compact section label and short invitation create a clean editorial strip." },
  { id: 8, name: "Access steps", variant: "steps",
    description: "A single step marker makes the next account or access action clear." },
  { id: 9, name: "Edge action", variant: "edge",
    description: "An action at the outer edge gives the message a strong, easy-to-find finish." },
  { id: 10, name: "Quiet status", variant: "quiet",
    description: "A small status icon and a concise invitation keep attention on the app." },
] as const satisfies readonly MobileBannerReviewDesign[];
