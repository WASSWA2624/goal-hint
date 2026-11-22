# Direct subscription checkout

## Goal

Take users from subscription-locked actions directly to package selection and payment when checkout is available. Reuse the existing checkout and keep one shared navigation behavior across gated surfaces.

## Scope

- Verify the current route behavior before changing it. `subscriberHref` already routes signed-in users to Subscribe, where `SubscribeRoute` can render `SubscribeFlow`. Open that existing flow at package selection without requiring a separate Subscribe landing or an extra action to begin checkout.
- Apply the shared behavior to locked Matches cards and prediction actions, locked Slips feature buttons and cards, Slip Builder, and other actions using the same subscription gate. Use the existing localization system and shared controls. Use the exact English labels **Unlock predictions** for Matches, **Unlock slip** for Slips, and **Unlock slip builder** for Builder. Keep **Build slips** on the unlocked Builder.
- Send signed-out users through sign-in or registration as appropriate to the entry point. Carry the checkout intent and a validated internal destination through auth and checkout. Preserve ordinary auth landing behavior for other entries. Evaluate current access after auth. Open the destination for users with access, or open package selection for eligible users who need access, including expired subscribers renewing.
- Return the user to the originating match, slip, or Builder once the server confirms that the current purchase or another eligible activation in this flow has granted access.
- Keep server-side entitlement and production sales-readiness checks effective. If checkout is genuinely unavailable, show the relevant status and an appropriate way to return or recover. Keep pending payments in their legitimate status flow and offer the existing retry or recovery path for cancelled and failed payments. Preserve eligible trials, manual payments, wallet and referral behavior, and public content access. Leave Flutterwave integration for the follow-up task.

## Completion criteria

- Verify direct entry and the approved labels on Matches cards and prediction actions, locked Slips buttons and cards, Builder, and any other shared gate touched. Cover signed-out, signed-in without access, expired, and already-entitled users on desktop and mobile in both light and dark themes.
- Verify sign-in and registration handoffs, safe rejection of invalid return destinations, and return with usable access after verification. Cover pending, cancelled, failed, and genuinely unavailable checkout, including production sales-readiness gates. Confirm existing access, trial, and payment options still work where eligible.
- Follow `AGENTS.md` for shared theme tokens, controls, row layout, persistent app chrome, and loading. Use `NavigationProgress` below the header for foreground loading and appropriate `aria-busy` or `AppLoading` behavior. Update root `APP_OVERVIEW.md` to describe the resulting workflow and distinguish implementation from deployment status.
