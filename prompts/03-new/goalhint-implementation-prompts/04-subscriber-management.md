# GoalHint — 04: Subscriber Administration and Bulk Actions

## Objective
Make the existing **Admin → Subscribers** tools fully functional and faster to use, while **retaining the existing list, Open button, account-detail page, layout, and components**. This list includes registered accounts, even if not currently paying. Execute after prompts 01–03.

## First inspect
Review Subscribers listing/details, permissions, existing actions and dialogs, payment/access relationships, audits, and erase/delete semantics. **No screenshots will be provided**; derive the UI from the current code. Do not duplicate business logic between quick actions and details.

## Individual quick actions
1. Put a **vertical three-dot menu (⋮)** on the right of **each account row**, alongside the existing **Open** action.
2. Include **Grant Access**, **Change Number**, **Block/Unblock Account**, **Log Out Devices** if supported, **Change Password / Password Reset**, **Erase Personal Data**, and **Permanently Delete Account**. Use the existing action handlers and confirmation flows. The password action should open/reuse the **secure link-based admin reset** from prompt 02—not set or send a plaintext password directly.
3. The same relevant actions must work from the individual account details page. Show clear success/error feedback and refresh the list/details after changes.

## Bulk actions — top of Subscribers list
4. **Directly above the existing subscriber list**, place a compact, easy-to-see selection toolbar using current components: a single **Select All** checkbox, a **selected count**, and one **Manage** button. Each account row also gets its own checkbox. Check/uncheck Select All to select/deselect **only the accounts on the current visible page** of the filtered list (not every account in the database); individual selections work independently. Make the scope clear and keep selections predictable when filters/pages change.
5. **Manage** stays disabled until at least one account is selected. Clicking it opens a single compact dropdown with applicable bulk actions: **Grant Access**, **Block/Unblock**, **Log Out Devices** (if supported), **Erase Personal Data**, and **Permanently Delete**. **Do not bulk-change phone numbers or passwords.** Keep the toolbar at the **top of the list**, visible and sensibly responsive on mobile and desktop; avoid multiple always-visible action buttons, clutter, or redesign. Preserve each row's individual ⋮ menu.
6. Show the exact number of selected accounts; before any destructive operation, confirm the action and the affected account count. Validate authorization server-side for **every** selected account and report partial failures per account, without silently applying unintended changes.

## Deletion and erasure
7. Verify **Permanently Delete** really performs the app's promised irreversible account deletion and eligible linked-data cleanup (including access/payments/attachments as defined), updating affected dashboard totals. Verify **Erase Personal Data Instead** removes/anonymizes identifying details while preserving allowed accounting amounts/access history. Respect legally required financial retention and the application's audit policy; do not silently treat erasure and deletion as the same operation.
8. Preserve admin role restrictions and log privileged operations in an appropriate privacy-conscious manner. Avoid irreversible actions until confirmed.

## Verify
Test individual/Select All checkbox behavior (including deselect, filtering, and page boundaries), disabled/enabled Manage control, selected count, dropdown actions, single and bulk confirmations, status changes, revoked devices, financial summaries, permissions, partial failures, desktop/mobile layout, and link-based password reset integration. List changed files and tests; no broad redesign.
