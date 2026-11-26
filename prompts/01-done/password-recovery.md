# GoalHint — 02: Admin-Managed Password Recovery

## Objective
Implement the agreed **manual, admin-assisted password-reset flow** by extending existing authentication and admin UI. **No paid SMS provider, WhatsApp API, automatic outbound delivery, or screenshot is required.** Execute after `01-authentication.md`.

## First inspect
Review current Forgot Password entry, phone accounts, session/security mechanisms, admin menu, admin contact/settings, database models, and shared dialogs. Reuse styles/components and existing access controls; add only necessary UI, storage, and routes.

## User flow
1. **Login → Forgot Password** opens **one dialog**: registered phone number (prefilled when available), question **“Do you want to request a password reset?”**, **No/Cancel** and **Yes/Continue**.
2. **No** closes it. **Yes** creates a pending admin request **only if no unresolved valid request exists**. Within the **same dialog**, show **“Your password reset request has been sent to our support team”**, plus **Call Admin**, **WhatsApp Admin**, **SMS Admin**, **Close**. Use the admin contact already configured in the app; phone/WhatsApp/SMS actions open the respective device app, with a prepared support message where supported.
3. If an unresolved request already exists (including an active generated link), **do not create a duplicate**. Instead show **“You already have a password reset request. If support is delayed, contact the admin.”** with the same contact actions. An expired link may be replaced with a newly generated link; older links are invalidated.

## Admin flow
4. Add **Password Requests** to the existing admin menu with a pending count. The list shows account phone, request date, status, and **Open**. The request details use the existing admin layout and show account information and the necessary ownership-verification step.
5. Once ownership is verified, **Generate Password Reset Link** creates an unpredictable, account-bound link and updates status **Pending → Link Generated**. It is valid **24 hours from generation**; reopening the link is permitted, but **only one successful password change** can consume it. A newly generated replacement immediately invalidates the previous link. Keep the currently generated link and prepared message **viewable to authorized admins while valid**, including after revisiting the request; store secrets securely (e.g., encrypted for authorized retrieval, never in logs).
6. Show a short, understandable message containing the link, instructions, **24-hour expiry**, and **single-use-on-success** explanation. Provide **Copy Message**, **Send via SMS**, and **Send via WhatsApp**: SMS opens the admin device's messaging app with user phone and draft filled; WhatsApp opens the conversation with user phone and draft filled; Copy works for any other channel. The admin presses Send **manually** in that external app. Handle missing apps gracefully.
7. Provide a separate **Mark as Sent** confirmation control after the admin manually sends the message. Record only the admin's declaration, time, and selected channel; **do not change the main request status to “Sent,”** do not claim actual delivery, and never confuse link generation with password reset completion. Keep **Link Generated** visible until reset or expiry.

## Reset link page
8. Show **New Password**, **Confirm Password**, **Save New Password** with optional show/hide. Follow prompt 01's simple password rules. On successful save, securely update password, atomically invalidate the link, revoke appropriate existing sessions, set request status **Completed**, then show **“Password changed successfully”** and return to Login.
9. Expired, replaced, or already-used links show a friendly explanation and path to submit a new request. Do not consume a link merely by opening it. Prevent concurrent double redemption, repeated-request spam, unauthorized admin actions, and disclosure of reset tokens in logs.

## Verify
Test every dialog branch; repeat requests; contact links; manual draft creation; expiry at 24 hours; repeated opens; successful one-time redemption; replacement invalidation; admin display persistence; status transitions; and failed/absent native apps. Report changed files and test results; preserve existing page layouts.
