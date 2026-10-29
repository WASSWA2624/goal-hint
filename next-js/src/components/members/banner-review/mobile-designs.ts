export type MobileBannerReviewDesign = Readonly<{
  id: number;
  name: string;
  description: string;
  variant: "inline" | "stacked" | "split" | "rule" | "price" | "contrast" | "editorial" | "steps" | "edge" | "quiet";
  recommended?: boolean;
}>;

export const mobileBannerReviewDesigns = [
  { id: 1, name: "Inline invitation", variant: "inline", recommended: true,
    description: "A natural sentence with actions inside the message. A quiet companion to the desktop design." },
  { id: 2, name: "Headline and links", variant: "stacked",
    description: "A short benefit above a clear action line, with a little more room for the message." },
  { id: 3, name: "Split action", variant: "split",
    description: "Compact copy on the left, with the next action grouped on the right." },
  { id: 4, name: "Accent rule", variant: "rule",
    description: "A slim vertical rule leads the message and keeps the surface almost bare." },
  { id: 5, name: "Price first", variant: "price",
    description: "The entry price anchors the offer. Active access takes its place for subscribers." },
  { id: 6, name: "Contrast strip", variant: "contrast",
    description: "A narrow brand-colored strip gives the invitation stronger emphasis." },
  { id: 7, name: "Editorial note", variant: "editorial",
    description: "A small section label and a two-line note give the banner an editorial feel." },
  { id: 8, name: "Access steps", variant: "steps",
    description: "A compact account-to-access sequence shows the next step at a glance." },
  { id: 9, name: "Edge action", variant: "edge",
    description: "An action at the outer edge gives the message a strong, easy-to-find finish." },
  { id: 10, name: "Quiet status", variant: "quiet",
    description: "A small status icon and a concise invitation keep attention on the app." },
] as const satisfies readonly MobileBannerReviewDesign[];
