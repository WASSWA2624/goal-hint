# GoalHint — 01: Authentication and Account Sessions

## Objective
Improve the **existing** registration, login, logout, session, and signed-in password-change flows. Do not rebuild authentication or redesign its screens.

## First inspect
Find the current auth screens, API handlers, validation, database models, middleware, account settings, and device/session management. Identify what already works; modify only gaps or defects. **No screenshots are supplied.** Reuse the current components, styles, routes, and conventions.

## Requirements
1. **Registration:** Use **phone number + password only**; no email requirement and no SMS/WhatsApp OTP. Normalize and validate the phone number using existing country handling; prevent duplicate accounts. Before creating the account, display a simple confirmation dialog showing the entered phone number with **Confirm** and **Edit/Cancel**. On success, automatically log the person in and navigate to **Matches**.
2. **Login:** Preserve phone-number/password login. Provide clear, plain-language feedback for invalid credentials and network errors; prevent accidental duplicate submissions.
3. **Sessions and logout:** Keep users signed in across ordinary visits using the existing secure, persistent session mechanism. Logout must revoke the relevant session; existing **Log out devices** admin functionality must revoke the selected active sessions correctly. Ensure protected routes and APIs honor session revocation.
4. **Change password while logged in:** Keep the existing account-settings entry point or add a minimal one if missing. Require **New password** and **Confirm password** to match. Per the product decision, impose **no minimum-length or character-composition rule**, and allow repeated characters and previously used passwords. Require a nonempty password, hash securely, and retain server-side rate limiting and session safeguards.
5. Ensure users with no account can still access intended public/guest views; **paid-access rules are handled by prompt 03**, not here.

## Verify
Test successful/cancelled signup, duplicate phone, persistent login, invalid login, logout, revoked devices, password change, mobile layout, and failures. Run relevant tests/typecheck/lint. Summarize actual files changed and any unresolved gaps. Do not add an external messaging provider or change prediction logic.
