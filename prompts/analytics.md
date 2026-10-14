Create a complete, responsive analytics dashboard for **GoalHint** at **`/analytics`**.

Track total and unique visitors, page views, live visitors, new versus returning users, visit frequency, session duration, time per page, bounce rate, popular content, navigation paths, clicks, searches, downloads, and conversions. Include device, browser, operating system, approximate country/city, traffic sources, referrers, and campaign attribution.

Provide summary cards, interactive charts, sortable tables, date filters, period comparisons, segmentation, and CSV export. Implement real tracking and persistent storage—not mock data—with loading, empty, and error states.

Protect the dashboard and reporting APIs with server-side authentication. Use **username `admin`, password `admin` for development only**; require secure production credentials, hashed passwords, secure sessions, login rate limiting, and logout. Never expose credentials in frontend code.

Respect consent preferences, minimize personal data, exclude bots and administrator activity, and provide configurable data retention. Document metric definitions and setup, and test tracking accuracy, access controls, and mobile usability.