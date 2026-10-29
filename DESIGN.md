# Design direction

> Written by the agent that rebuilt the UI, because the project had no brand guide. Replace it with your own direction when you have one; the tokens in `apps/web/src/index.css` follow this file.

**Reading:** a developer tool workbench for people who automate browsers, in a quiet instrument-panel style.
**Dial:** ENERGY 1 / RHYTHM 1 / MOTION 1. The editor, the page and the log are the content; the chrome around them stays out of the way.

## Identity

- **Signal colour.** One accent, a vermilion (`--signal`), used only for things that mean "the browser is executing": the Run button, the live dot in the wordmark and address bar, breakpoints, the paused line, and the active file tab. Everything else is neutral, so the moment a run starts is the only bright thing on screen.
- **Warm graphite neutrals.** Surfaces carry a slight warm hue (oklch hue 60–75) instead of the blue-black most code tools use. It reads calmer during long sessions and keeps the product from looking like a GitHub or VS Code clone.
- **Typography.** IBM Plex Sans for interface text and IBM Plex Mono for code, logs, file names and numbers. Plex was drawn for engineering material and keeps `Il1` and `0O` apart at small sizes, which matters in logs. Both are bundled, so nothing is fetched from a font CDN. The wordmark is the product name in Plex Mono with the signal dot; no logo was supplied.
- **Dark first, light supported.** The default is dark because the product is a code editor used for long stretches; the light theme is a full equal, toggled from the top bar.

## Rules the UI follows

- Radius 6px on controls, 8px on dialogs. No pill shapes except avatars and switches.
- Shadows only on things that float above the page: menus, popovers, dialogs, toasts.
- Status colours (`--success`, `--warning`, `--danger`) are functional and appear only on log lines, run results and validation messages.
- All text pairs meet WCAG AA in both themes (checked when the tokens were set; light-theme warning was darkened to 5.4:1 to pass).
- Motion follows Emil Kowalski's rules: buttons scale to 0.97 on press, popovers grow from their trigger, dialogs fade in about 200ms, nothing animates on keyboard shortcuts, and `prefers-reduced-motion` turns off movement.
- Touch screens get 44px hit areas through one rule in `index.css`, so the desktop layout can stay dense.
