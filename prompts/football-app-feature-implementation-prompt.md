# Football Prediction App — Feature Implementation Prompt

**Objective:** Improve subscriber experience, retention and organic marketing across responsive web, Flutter Android and desktop apps. Integrate into the existing Next.js/Express architecture. **Do not implement automatic payments or change the existing manual payment approval process.** Preserve existing UI, features and business rules unless necessary for these additions.

## Subscriber experience
1. **Saved Slip Builder configurations:** Add a compact **My Saved Settings** dropdown above the existing filters, plus **Save**. Allow up to 10 named configurations per account; preserve all selected markets, odds/probability ranges, dates, upcoming/live criteria and other existing filters. Selecting one populates the form; **Build Slip** remains a separate action. Support update, save as new, and optional default. In the subscriber dashboard, allow rename, duplicate, delete and **Use in Slip Builder**.
2. **Saved slips and performance:** Add optional **Save Slip** and **Share** actions to ready-made and generated slips. Do not automatically save generated slips. Show saved slips, settled results (won/lost/void/pending) and **My Performance** (settled count, wins, losses, success rate; 7 days/30 days/all time) in a compact, collapsible dashboard section. Never imply that a prediction guarantees a win.
3. **Simple subscriber dashboard:** Display subscription package, status, expiry and renewal action; trial days remaining; saved slips; saved configurations; personal performance; notifications and preferences. Avoid duplicated controls and clutter.
4. **Notifications:** Add an in-app bell and opt-in push notifications where supported for new predictions, saved-slip results and relevant updates. Include essential payment/renewal notices and trial reminders (e.g. days 5 and 7 of a seven-day trial). Allow users to control nonessential alerts; prevent duplicates and notification overload.

## Marketing and retention
5. **Community links:** Add unobtrusive **Join Our Community** links to official WhatsApp and Telegram channels; configure URLs in admin settings.
6. **Referral programme:** Give each subscriber a shareable referral link/code. Award a small, configurable **subscription-time** reward only after a referred user's first payment is manually verified; prevent self-referrals and duplicate rewards. No cash payouts.
7. **Promo codes and campaign tracking:** Support configurable discounts, expiry dates and redemption limits; attribute sign-ups and verified subscriptions to campaigns/referrals. Respect the existing manual payment workflow.
8. **Social sharing:** Add **Share** to individual predictions and slips, using a mobile-friendly share sheet/WhatsApp where available. Include a concise branded preview and a deep link to the relevant public or access-controlled page; never expose private user information.
9. **Trial conversion and feedback:** Keep the admin-configurable free-trial duration and full trial feature access. Show remaining days and a **Subscribe** action; preserve existing expiry SMS. Offer a brief, optional reason for non-renewal and a lightweight in-app feedback form.
10. **Admin analytics and prediction context:** Show basic sign-up, trial-to-paid, renewal, referral and promo-code metrics. Where existing data supports it, offer a short **Why this probability?** explanation based on verifiable statistics; otherwise show no invented explanation.

## Implementation requirements
- Reuse existing components and APIs; keep mobile UI compact, accessible and responsive. Store user-specific records against a stable internal user ID (phone number remains the login identifier).
- Enforce authentication, access permissions, validation, anti-abuse checks and privacy protections server-side. Ensure cross-platform consistency and avoid unnecessary API-Football calls by reusing stored match data.
- Implement in small, testable stages; add database migrations, API endpoints, UI states and tests as required. Verify saved configurations, results updates, sharing, referral eligibility and manual payment compatibility before release.
- **First review the current codebase and present a brief implementation plan. Do not start modifying code until approval is given.**
