/** Keep the opaque audit actor on the server; dashboards show a readable identity. */
export function adminDisplayName(identity: Readonly<{ username: string; memberAccountId?: string }>): string {
  return identity.memberAccountId ? "Administrator" : identity.username;
}
