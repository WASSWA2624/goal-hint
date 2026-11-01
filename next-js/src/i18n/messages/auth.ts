/** Canonical authentication vocabulary for localized screens, messages and previews. */
export const authLabels = {
  signIn: "Login",
  signUp: "Register",
  signOut: "Log out",
} as const;

/** Verbs are separate from the Login noun used by buttons and navigation. */
export const authVerbs = {
  signIn: "log in",
  signUp: "register",
  signOut: "log out",
} as const;

/** Complete default-locale messages for shared server, admin and offline surfaces. */
export const authCopy = {
  accountExists: `An account already exists, so please ${authVerbs.signIn}.`,
  accountUpdate: "Goal Hint: Your account has been updated. Log in to view the details or contact admin for help.",
  loginUnavailable: "Account login is unavailable.",
  administratorRequired: "Log in with an administrator account.",
  administratorLoginAgain: "Log in again with an administrator account.",
  settingsLoginUnavailable: "Owner login is unavailable, so protected settings cannot change now.",
  analyticsLoginRequired: "Log in to view analytics.",
  ownerSessionEnded: `Your owner session has ended. Reload the page and ${authVerbs.signIn} again; nothing was saved.`,
  administratorSessionEnded: "Your administrator session has ended. Log in again.",
  loginAgain: "Log in again to continue.",
  paymentLoginAgain: "Log in again to check this payment.",
  passwordWhileLoggedIn: "Use Change password in Account while logged in.",
  offlineConnection: "Predictions, login, account changes and payments need an internet connection. Nothing is queued or submitted from this view.",
  lastLogin: "Last login",
  logoutDevices: `${authLabels.signOut} devices`,
  logoutAllDevices: `${authLabels.signOut} all devices`,
  allDevicesLoggedOut: "All devices logged out.",
  allDevicesLoggedOutEvent: "All devices logged out",
  blockedDevicesLoggedOut: "Account blocked and devices logged out.",
  unblockHelp: `Allow this member to ${authVerbs.signIn} again.`,
  blockHelp: `Prevent login and ${authVerbs.signOut} every device.`,
  devicesLoginHelp: `The member will need to ${authVerbs.signIn} again on every device.`,
  accessNextLogin: "Devices already unlocked keep access; the member's next login unlocks one.",
  accessDeviceHelp: "Logged-in devices unlock at once; others unlock when the member logs in.",
  trialRegistration: "Free trial on registration",
  trialRegistrationDays: "Free trial on registration (days)",
  registrationAbuse: "Verified registration abuse",
  securityCategory: "Login & security",
  administratorLoggedIn: "Administrator logged in",
  administratorLoggedOut: "Administrator logged out",
  administratorLoginRefused: "Administrator login refused",
  subscriberPreviewNote: "Fictional records and network assignments · 29 October 2026 snapshot. Actions stay inside this preview. Recent login is not live online presence.",
  analyticsCounted: "Only browsers that allowed analytics. Global Privacy Control, Do Not Track, bots, automated browsers and logged-in or previously logged-in administrators are excluded.",
  analyticsExcluded: `Visitors appear here once they allow analytics in the consent banner; your own browser is excluded after you ${authVerbs.signIn}.`,
  headerActionEmphasis: "Accent-filled payment or registration actions stand out beside subtly tinted theme and account controls.",
} as const;

export const authMessages = {
  "auth.signIn": authLabels.signIn,
  "auth.signUp": authLabels.signUp,
  "auth.signOut": authLabels.signOut,
  "auth.signInToAccess": `${authLabels.signIn} to access`,
  "auth.backToSignIn": `Back to ${authLabels.signIn.toLowerCase()}`,
} as const;
