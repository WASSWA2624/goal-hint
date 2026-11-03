# Native payment-review alerts

3 November 2026 — **Partial**: safe Android/Windows adapters and shared web integration implemented; configured delivery and release qualification remain outstanding.

`NativePaymentAlerts` owns notification display/sound, validated UUID tap routes, permission controls, endpoint binding, persisted deduplication and resolution clearing. Android uses Firebase Messaging 17 installation IDs and a native data-message handler for foreground/background display. Windows uses native local notifications and owned-document discovery while running; the general WebView2 bridge stays disabled. Native notification payloads cannot approve a payment or carry a financial/evidence screen. Next.js retains all authentication, accounting and review rules.

The original 0.85-second WAV is copied into Android raw resources and the Windows Flutter asset. Unpackaged Windows sound falls back to the normal system sound. Closed-process WNS is blocked on an approved identity/packaging/activation arrangement, not represented as supplied by FCM. Apple/Linux transport qualification remains open.

Analysis and 79 unit tests passed; seven final payload/navigation checks passed. Android debug build is blocked by the host's Gradle/JDK loopback socket failure. See the [shared runbook and final verification](../../next-js/docs/payment-review-alerts.md) for the Windows build result, exact provider/build settings, real-device gaps, measured cadence, rollback and approval gates. No installer was signed/published, live messaging enabled or native payment logic added.
