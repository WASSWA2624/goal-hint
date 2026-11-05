# 298 Slip share preparation feedback

## Scope

Show clear progress while a slip's share images are prepared, and identify the dialog with the shared Share icon beside its title.

## Implementation

- Reuse `NavigationProgress` beneath the dialog header and report foreground work through `AppLoading`.
- Show “Preparing your slip…” and “Creating an image you can download or share.” until preparation completes. Keep the status outside the busy preview region so assistive technology can announce it.
- Keep Close available and the existing Download image/Share labels visible while their actions are disabled. Replace preparation feedback with the preview or existing error/retry state.
- Reuse theme tokens, shared icon styling and reduced-motion behavior. Preserve the existing image generation, download and sharing flow.

## Verification

Check delayed preparation, successful preview, failure/retry and closing while pending in the synthetic sharing fixture. Verify phone and desktop layouts in both themes, plus reduced motion and existing sharing regressions.

## Results

- All 25 existing sharing, image, asset and download regressions passed. TypeScript, targeted ESLint and whitespace checks passed.
- The production sharing fixture built and passed its HTML, metadata and recipient-access checks.
- Delayed preparation and successful preview passed at 390px and 1440px in both themes. The loading bar sits below the header, the title icon is decorative, status announcements remain outside the busy preview, and action labels stay visible.
- Error/retry, close while pending, focus restoration and reduced-motion behavior passed with no browser runtime errors. Screenshots confirmed the light and dark loading layouts.
