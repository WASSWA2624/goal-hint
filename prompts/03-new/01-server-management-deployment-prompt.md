# Implementation Prompt: Optimized, Incremental Deployment and Persistent Environment Architecture

## Objective

Review, optimize, and implement the application's complete development, staging, and production architecture.

**The primary goal is to minimize server storage, eliminate unnecessary duplication, preserve application data, and deploy only the changes required by each release.**

Do not redesign, rewrite, or change existing application functionality.

## 1. Environment architecture

Maintain three independent environments:

**Development**
- Runs on the local development computer.
- Uses the `development` Git branch.
- Has one local application codebase and database.

**Staging**
- Runs on the Ubuntu 24 VPS.
- Uses the `staging` Git branch.
- Has one active application codebase, one required dependency installation, and one persistent staging database.
- Uses its designated staging URL.

**Production**
- Runs on the Ubuntu 24 VPS.
- Uses the `production` Git branch.
- Has one active application codebase, one required dependency installation, and one persistent production database.
- Uses its designated production URL.

Keep the environments isolated. Never mix their database records, credentials, runtime configurations, or application files.

## 2. Single persistent application version

Enforce the following rules in every environment:

1. Maintain exactly one active application installation.
2. Update the existing installation whenever a new version is deployed.
3. Replace modified files with their latest approved versions.
4. Preserve files that have not changed.
5. Remove obsolete application files no longer required by the latest version.
6. Prevent archived releases, historical application folders, and duplicate code installations from accumulating.
7. Maintain GitHub as the authoritative source of code version history.

Do not maintain additional historical application releases on the VPS.

## 3. Incremental deployment

**This is a critical requirement.**

Deployments must transfer and apply only the necessary changes whenever technically possible.

Implement change detection to identify:

- Newly added files.
- Modified files.
- Deleted files.
- Added, updated, or removed dependencies.
- Database schema changes.
- Changes affecting application builds or runtime configuration.

Use reliable synchronization techniques, such as Git commit comparisons, file manifests, or checksums.

For Node.js and Next.js:

- Avoid reinstalling unchanged dependencies unnecessarily.
- Respect package-lockfiles and reproducible installation requirements.
- Rebuild applications when changes require it.
- Transfer only necessary deployment artifacts where technically feasible.
- Never sacrifice deployment correctness merely to reduce transferred data.

Inspect Flutter components, if present, and handle their build and deployment requirements appropriately.

## 4. Persistent database management

Each environment must maintain exactly one primary application database.

Enforce these rules:

1. Never recreate the database during ordinary deployments.
2. Never replace the database with a previous version.
3. Preserve all existing records and user-generated data.
4. Apply necessary schema changes through controlled migrations.
5. Do not create additional databases for version history.
6. Do not duplicate database records when deploying application updates.
7. Never overwrite production records with staging or development data.

Database updates must preserve existing information while incorporating legitimate new changes.

## 5. Strict no-backup policy on the VPS

**The VPS must not be used as backup storage.**

The deployment system must not create or retain:

- Database backup copies.
- Historical database snapshots.
- Archived application releases.
- Backup copies of source code.
- Duplicate application installations.
- Persistent database dumps.
- Unnecessary deployment archives.

Backup management is handled independently outside the VPS by another responsible system or administrator.

Do not implement, modify, or interfere with that external backup system.

Temporary files required for safe deployments may be used, but they must be removed after successful deployment and verification.

Do not delete legitimate application data, required runtime files, or existing externally managed resources.

## 6. Deployment workflow

Enforce the following sequence:

**Development → Staging → Production**

When deploying:

1. Identify the approved Git commit.
2. Compare it against the currently deployed version.
3. Determine the required changes.
4. Validate source code and dependencies.
5. Apply the necessary application updates.
6. Execute required database migrations.
7. Rebuild and restart affected services where necessary.
8. Verify the application is functioning correctly.
9. Remove obsolete deployment artifacts.
10. Confirm that only one active application version remains.

Staging must pass validation before the same tested commit and corresponding build are promoted to production.

Do not automatically synchronize staging database records into production.

## 7. Independent deployment mechanisms

These requirements must apply regardless of whether deployment happens through:

- Manual commands.
- SSH.
- Git.
- GitHub Actions.
- Another supported deployment mechanism.

Create or update reusable deployment scripts so that all supported deployment methods follow the same rules.

Prevent concurrent deployments and detect failures.

Where safe replacement requires temporary deployment files, permit them only for the duration necessary and clean them afterward.

## 8. Server storage optimization

Audit staging and production storage for:

- Duplicate application directories.
- Old deployment folders.
- Unused dependencies.
- Abandoned temporary files.
- Unnecessary archived builds.
- Obsolete generated artifacts.
- Duplicate application installations.

Remove confirmed unnecessary files safely.

Do not delete unrelated files, active database storage, uploaded user content, required logs, configuration files, or files belonging to other applications.

Keep server storage consumption as low as reasonably possible without compromising functionality or reliability.

## 9. Failure handling

Ensure that:

- Failed deployments do not corrupt persistent databases.
- Partial updates do not leave the application in an inconsistent state.
- Deployment errors are reported clearly.
- Code can be restored by deploying an earlier commit from GitHub.
- Database migrations are designed with compatibility and recovery limitations in mind.
- Temporary files are cleaned up after failed deployments when safe.

Do not create permanent backup copies or historical release folders to implement these protections.

## 10. Verification and acceptance criteria

Verify that:

- Each environment has exactly one active application codebase.
- Each environment has one designated persistent database.
- Dependencies are installed only where required.
- Deployments avoid transferring unchanged files unnecessarily.
- Existing database records remain intact.
- New records are preserved across subsequent deployments.
- Deleted or obsolete application files do not accumulate.
- No server-side backup archives are created.
- GitHub remains the authoritative code version-control system.
- Staging and production remain independent.
- Storage usage does not continually increase because of accumulated deployment copies.

## 11. Implementation instructions

Before making changes:

1. Inspect the entire existing project and deployment architecture.
2. Identify current deployment methods, application directories, databases, and dependencies.
3. Identify duplication, storage waste, and inefficient deployment processes.
4. Implement the necessary improvements without changing existing UI, functionality, or business logic.
5. Test and verify the implementation.
6. Document changes, deployment commands, and verification results.

Do not delete uncertain or potentially important existing files automatically. Report them for review.

**Final requirement:** Implement this architecture consistently across the project. The result must be an efficient, incremental deployment system with one active application installation and one persistent database per environment, without unnecessary historical copies or server-side backups.
