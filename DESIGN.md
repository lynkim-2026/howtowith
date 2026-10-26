# Design

Paper & ink. An Operate-mode study tool for one-handed phone use, light by default in daylight and genuinely dark at night (follows the system, overridable).

## Color

Warm paper neutrals tinted toward amber (never pure white/black); one accent, vermilion, reserved for the primary action, the active tab and "due" signals. Rating colors are muted semantic tints: Again red, Hard amber, Good green, Easy blue. All tokens are OKLCH custom properties in `app/css/style.css`; the dark theme redefines the same names.

## Typography

English sentences are the content, set in Newsreader (self-hosted variable serif) at 1.6–1.75rem. Korean and UI use the system sans stack so Hangul never falls back to an unintended face; Korean uses `word-break: keep-all`. Numerals are tabular.

## Layout

One column, max 560px, 20px gutters, bottom tab bar (홈 · 복습 · 목록 · 통계 · 관리) with safe-area padding. Lists are hairline-separated rows, not stacked cards; the only elevated surface is the study card. Study sessions hide the tab bar.

## Motion

One authored moment per surface: views rise in (320ms, exponential ease-out), the answer reveals with a clip-path wipe, progress bars ease to value. `prefers-reduced-motion` collapses all of it.

## Components

Primary / quiet / danger buttons (48px min), segmented control, chips, badges, progress bar, bar chart, modal `<dialog>`, toast. Focus ring, selection, caret, placeholder and scrollbar are themed from the palette.
