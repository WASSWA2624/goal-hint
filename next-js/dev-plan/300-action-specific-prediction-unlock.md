# 300 Action-specific prediction unlock

## Scope

Give locked desktop match rows, including rows inside slips, one brief action-specific label: “Log in or register to unlock” for guests, “Subscribe to unlock” for signed-in viewers without access, and “Renew to unlock” for confirmed expired subscriptions.

## Implementation

- Keep label selection in the shared unlock control, using the existing private session store for confirmed expiry. The server fallback is Subscribe; the session refresh resolves Renew without adding per-card requests or private state to cacheable page data.
- Reuse the existing account registration screen with its Login alternative for guests, and the subscription plan/checkout screen for subscribing and renewing. Keep validated match/slip return parameters and existing authentication-completion rules.
- Preserve the lock icon, shared control sizing and theme tokens, authorized prediction fields, compact slip-header actions and mobile controls.

## Verification

Check guest, unsubscribed and expired desktop rows in feed and slips in both themes, including text fit, pointer/keyboard activation and action destinations. Retain mobile and entitled/completed-row regressions, validate private session expiry behavior, and run TypeScript and targeted lint.
