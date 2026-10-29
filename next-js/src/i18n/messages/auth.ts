/** Canonical authentication vocabulary, shared by localized copy and review-only previews. */
export const authLabels = {
  signIn: "Sign in",
  signUp: "Sign up",
  signOut: "Sign out",
} as const;

export const authMessages = {
  "auth.signIn": authLabels.signIn,
  "auth.signUp": authLabels.signUp,
  "auth.signOut": authLabels.signOut,
  "auth.signInToAccess": `${authLabels.signIn} to access`,
  "auth.backToSignIn": `Back to ${authLabels.signIn.toLowerCase()}`,
} as const;
