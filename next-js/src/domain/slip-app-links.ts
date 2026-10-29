/** Public native identities, restricted to the shared-slip HTTPS route. */
export const slipAppIdentity = Object.freeze({
  androidPackage: "com.goalhint.goal_hint",
  iosBundle: "com.goalhint.goalHint",
  path: "/s/*",
});

/** Unknown or malformed signing configuration must not associate any app. */
export function androidAppLinkFingerprints(value: string | undefined): readonly string[] {
  if (!value?.trim() || value.length > 2_000) return [];
  const fingerprints = value.split(",").map((item) => item.trim().toUpperCase());
  if (fingerprints.length > 16 || fingerprints.some((item) => !/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(item))) return [];
  return [...new Set(fingerprints)];
}

export function androidAppLinkAssociation(fingerprints: string | undefined) {
  const allowed = androidAppLinkFingerprints(fingerprints);
  return allowed.length ? [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: slipAppIdentity.androidPackage, sha256_cert_fingerprints: allowed },
  }] : [];
}

export function iosAppLinkAssociation(teamId: string | undefined) {
  const team = teamId?.trim();
  const details = team && /^[A-Z0-9]{10}$/.test(team) ? [{
    appIDs: [`${team}.${slipAppIdentity.iosBundle}`],
    components: [{ "/": slipAppIdentity.path }],
  }] : [];
  return { applinks: { apps: [], details } };
}
