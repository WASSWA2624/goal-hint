# Connection recovery in Flutter

Flutter opens Goal Hint in its persistent WebView profile. The shared web application handles the connection message and prepares its verified assets. When a supported engine can use an existing prepared copy, a failed page request shows **Couldn’t load this page** with **Try again** at the original URL. The retry preserves its filters. The loaded website and its supported host theme control how the message looks. [Web connection recovery](../../next-js/docs/offline-startup.md).

The worker caches the connection page and its assets. Fixtures, accounts, payments and personalized pages stay online. Flutter adds no content cache or background queue. Cookies remain in the persistent WebView profile. Online authorization still applies to every private read and write.

## Origins and cold restart

Use HTTPS or a recognized loopback origin that supports service workers. Run a production-like web build with `npm run build` and `npm start`. Ordinary LAN HTTP supports online operation. `next dev` retires previous Goal Hint worker registrations. Keep the same origin and native profile through a test. A physical Android phone can use an owned wireless reverse mapping to a loopback server. [Development URLs](development-urls.md).

A prepared connection page can survive termination on engines that keep their profile and CacheStorage. A first launch without network or a launch after cache eviction uses the host’s connection error and Retry. The app must be online long enough to prepare again before testing a cold offline launch.

Windows forwards Flutter pause and resume to WebView2. The shared application pauses owned preparation while hidden and resumes its normal backoff in the foreground. A complete new bundle becomes available for future navigations while the active document retains its draft and focus. [WebView2 lifecycle](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/process-model).

Qualify each installed engine by preparing online, terminating, blocking the test origin and reopening the same profile. Verify the connection message, its original-URL retry, a first-use failure, and private-data and write isolation. Previous Windows cold-start results covered the earlier Saved Matches implementation. Record results for this connection page in the [native tracker](../dev-tracker.md).
