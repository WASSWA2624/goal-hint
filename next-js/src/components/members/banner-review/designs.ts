export type BannerReviewState = "signed-out" | "unsubscribed" | "active";

export type BannerReviewDesign = Readonly<{
  id: number;
  name: string;
  description: string;
  variant: "inline" | "split" | "centered" | "rule" | "price" | "editorial" | "contrast" | "stacked" | "journey" | "quiet";
  height: number;
  recommended?: boolean;
}>;

/** Shared vocabulary for the concepts; production localization is a separate implementation step. */
export const bannerReviewLabels = {
  signIn: "Sign in",
  signUp: "Sign up",
  signOut: "Sign out",
  subscribe: "Subscribe",
  account: "My account",
  viewPredictions: "View predictions",
  manageSubscription: "Manage subscription",
} as const;

/** Illustrative review offer, never a fallback for the server's current subscription plans. */
export const bannerReviewOffer = {
  price: "UGX 1,000",
  benefit: "Every prediction and odds",
  from: "from UGX 1,000",
} as const;

export const bannerReviewStates = [
  { id: "signed-out", label: "Signed out", description: "Create an account or return to an existing one." },
  { id: "unsubscribed", label: "Signed in · No subscription", description: "Choose a plan to unlock full access." },
  { id: "active", label: "Active subscriber", description: "Access confirmation, with no subscription advertising." },
] as const satisfies readonly { id: BannerReviewState; label: string; description: string }[];

export const bannerReviewDesigns = [
  { id: 1, name: "Inline invitation", variant: "inline", height: 38, recommended: true,
    description: "One quiet sentence with actions woven into the message. The most compact starting point." },
  { id: 2, name: "Split rail", variant: "split", height: 44,
    description: "A clear benefit on the left and a small, focused action area on the right." },
  { id: 3, name: "Centered sentence", variant: "centered", height: 38,
    description: "A centered invitation with underlined text actions and no button chrome." },
  { id: 4, name: "Accent rule", variant: "rule", height: 44,
    description: "A fine vertical accent anchors the offer; a restrained action balances the far edge." },
  { id: 5, name: "Price anchor", variant: "price", height: 44,
    description: "The entry price leads the strip. For subscribers, that position becomes an access confirmation." },
  { id: 6, name: "Editorial line", variant: "editorial", height: 38,
    description: "A small section label and a single sentence create a clean, editorial rhythm." },
  { id: 7, name: "Contrast strip", variant: "contrast", height: 42,
    description: "A stronger surface distinguishes the invitation while keeping the row thin and the actions simple." },
  { id: 8, name: "Two-line invitation", variant: "stacked", height: 52,
    description: "A short headline above the supporting message gives the offer a little more breathing room." },
  { id: 9, name: "Access steps", variant: "journey", height: 44,
    description: "A compact account-to-access sequence makes the next step explicit for each user." },
  { id: 10, name: "Quiet status", variant: "quiet", height: 36,
    description: "A small status icon, a concise message and text actions keep attention on the app." },
] as const satisfies readonly BannerReviewDesign[];
