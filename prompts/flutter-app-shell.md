# Flutter app shell

Create a minimal Flutter shell for this existing Next.js web app, placing the Flutter project files at the repository root alongside the web project without overwriting existing files or disrupting its workflow.

- Support installable Android, iOS, Windows, macOS, and Linux builds through suitable embedded web views and minimal reusable platform adapters.
- Keep all screens, navigation, business logic, and application features in Next.js. Flutter should only host the web app and provide necessary platform integration, avoiding duplicate implementations.
- Use one central development/production URL configuration. Development must support localhost where appropriate and a reachable host address for emulators or physical devices. Production must use the deployed HTTPS URL. Document how to configure each environment.
- Apply the existing branding to the installed app name, launcher icons, splash screen, and native light/dark appearance. Keep interface styling and theming controlled by the web app. Reuse established components and avoid adding rounded corners.
- After at least one successful online load, persist the app assets and permitted previously loaded content needed to start and display the last working cached app without internet, including after closing or restarting the app. Do not rely solely on an in-memory web view or a screenshot. Keep offline behavior in the shared web code wherever possible, adding only necessary platform support.
- When connectivity returns, check that the server is reachable, refresh content and cached assets, and safely apply available updates. Preserve the last working cache if an update fails and avoid interrupting active user input. Offline access covers cached content; server-dependent actions require connectivity. Provide a clear first-launch offline state when no cache exists, and respect authentication and logout when caching user-specific content.
- Use efficient, professional, reusable code and minimal maintained dependencies. Preserve existing repository changes. Document setup, development URLs, platform build requirements, offline behavior, and limitations. Verify online launch, offline cold start, reconnection updates, and failed-update recovery on each supported platform; clearly identify any platform that could not be tested.

Normal web UI and business-logic updates must be delivered through Next.js without rebuilding the Flutter shell; native configuration changes may require a new build.
