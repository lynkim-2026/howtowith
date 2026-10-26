# Design

Paper & ink. An Operate-mode study tool for one-handed phone use, light by default in daylight and genuinely dark at night (follows the system, overridable).

## Color

Warm paper neutrals tinted toward amber (never pure white/black); one accent, vermilion, reserved for the primary action, the active tab and "due" signals. Rating buttons are neutral surfaces; only the label carries meaning (Again red, Hard amber, Good green, Easy blue), so the study card stays the loudest thing on screen. All tokens are OKLCH custom properties in `app/css/style.css`; the dark theme redefines the same names.

## Typography

English sentences are the content, set in Newsreader (self-hosted variable serif) at 1.6–1.75rem. Korean and UI use the system sans stack so Hangul never falls back to an unintended face; Korean uses `word-break: keep-all`. Numerals are tabular.

## Layout

One column, max 560px, 20px gutters, bottom tab bar (홈 · 복습 · 목록 · 통계 · 관리) with safe-area padding. Lists are hairline-separated rows, not stacked cards; status is quiet meta text under the sentence, not a badge. Listening controls (듣기 · 0.8× · 반복) sit with the sentence as text buttons. Settings are folded into disclosure rows so the Data screen stays short; there is one primary action per screen. Study sessions hide the tab bar. The home screen is one statement (today's study and streak) and one button; choosing how to study happens in a bottom sheet after the tap, not in always-visible menus. The Study tab is a few icon tiles, not a text list. Stats are three dashboards: consistency (5-week calendar), memory (daily remember-rate line), and what is ahead (7-day forecast and stage mix).

## Motion

One authored moment per surface: views rise in (320ms, exponential ease-out), the answer reveals with a clip-path wipe, progress bars ease to value. `prefers-reduced-motion` collapses all of it.

## Components

Primary / quiet / danger buttons (48px min), segmented control, chips, badges, progress bar, bar chart, modal `<dialog>`, toast. Focus ring, selection, caret, placeholder and scrollbar are themed from the palette.
