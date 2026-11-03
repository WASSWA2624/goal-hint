# Readable slip sharing and downloads

- Accept eight-digit referral codes and slip-image filenames alongside existing invitation/shared tokens.
- Accept canonical published-slip URLs and image-only custom slips, retaining document/nonce/activation/visibility checks.
- Advertise readable-reference support so older hosts fail promptly instead of waiting on an invalid payload.
- Reuse bounded PNG parsing for system save operations: Android document/folder picker, iOS Files export, and desktop save picker.
- Verify parser, cancellation, concurrency, ownership and save-vs-share tests; format and analyze Dart. Physical targets, Android packaging and iOS compilation remain release checks until explicitly verified.
