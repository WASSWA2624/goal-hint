export const passwordResetPagePath = "/en/account/reset-password";

export function passwordResetMessage(link: string): string {
  return `Goal Hint password reset\n\nOpen this link to choose a new password:\n${link}\n\nThe link expires 24 hours after it was generated and can only be used for one successful password change. Keep this link private.`;
}

/** Let the installed app prepare the message without putting a reset link in an external HTTPS query. */
export function whatsappDraftHref(phone: string, message: string): string {
  return `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`;
}
