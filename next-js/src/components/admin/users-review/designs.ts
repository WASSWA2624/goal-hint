/** Each composition uses the same directory, user details, and action dialogs. */
export const userDesigns = [
  { id: "01", variant: "balanced", name: "Balanced compact", description: "A compact identity card, one action bar, and clear tabs beside a calm directory." },
  { id: "02", variant: "ledger", name: "User ledger", description: "Fine rules and aligned account facts keep the working area orderly and concise." },
  { id: "03", variant: "identity", name: "Identity strip", description: "A clear phone-number band anchors the record above compact actions and facts." },
  { id: "04", variant: "split", name: "Split summary", description: "Identity and account facts sit side by side, with a shared action row below." },
  { id: "05", variant: "ribbon", name: "Action ribbon", description: "A quiet colored action ribbon separates account identity from its detailed records." },
  { id: "06", variant: "quiet", name: "Quiet profile", description: "A centered, restrained profile keeps the phone number and account tasks easy to find." },
  { id: "07", variant: "dense", name: "Dense desk", description: "Short directory rows and a shallow summary leave the most room for user history." },
  { id: "08", variant: "accent", name: "Accent edge", description: "A narrow brand rail connects the selected user with their account details." },
  { id: "09", variant: "status", name: "Status first", description: "Account state leads each directory row and the selected user summary." },
  { id: "10", variant: "focus", name: "Detail focus", description: "A narrower directory and broad record panel give the selected tab more working space." },
] as const;

export type UserDesign = (typeof userDesigns)[number];
