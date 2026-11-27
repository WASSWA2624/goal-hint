# 310. Incremental hosted deployment

1. Confirm the current VPS account, the application and worker launch paths, database targets, and the last verified web commit for each environment.
2. Establish GitHub `development`, `staging`, and `production` branches from the verified history. Keep branches eligible for fast-forward promotion.
3. Verify clean local archives, reuse a verified build when build inputs are identical, and transfer changed files into a checksum-verified temporary installation. Test partial transfer and interrupted cutover handling.
4. Activate on staging, verify MariaDB and HTTPS, and prune audited legacy staging copies. Promote the same artifact only after staging succeeds. Repeat verification and cleanup for production.
5. Preserve worker paths referenced by active or fallback launchers. Prune only individually verified inactive artifacts under the worker locks. Report files that require independent review.

See the [deployment runbook](../docs/deployment/how-to-deploy.md#vps-staging-and-release-promotion) and [implementation evidence](../../implementation-docs/deployment-and-version-control.md).
