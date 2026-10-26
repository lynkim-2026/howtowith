# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Plain static HTML/CSS/ES modules, no framework or build step for app code (confirmed in brief). Deployed to GitHub Pages. Vendored libraries: ts-fsrs, read-excel-file.

## Users

One person (the owner), a Korean speaker learning English. They collect Korean/English sentence pairs from episodes they watch and record them daily in Excel (Howtowith.xlsx). They review on an Android phone (Chrome), in short gaps: commute, bed, breaks.

## Product Purpose

Turn the owner's daily Excel sentence list into spaced-repetition review on the phone. Success: the owner opens it daily, finishes today's due cards in a few minutes, and never loses their history.

## Positioning

Not a general vocabulary app: the content is the owner's own sentences, imported from their own spreadsheet. Fully local; no account, no server, no API cost.

## Operating Context

- Source data: Excel .xlsx, one sheet per episode/topic, column A Korean, column B English, header row "한글 / 영어". Sample: 1 sheet "시즌1_3화_기억력향상", 11 rows.
- All data lives in browser IndexedDB; JSON backup/restore is the safety net.
- Must work offline once installed (PWA). Free hosting only.

## Capabilities and Constraints

- Review modes: Korean to English (type or reveal), English to Korean, random, weak-expression focus.
- Scheduling by ts-fsrs with Again / Hard / Good / Easy.
- English TTS via the device Web Speech API (no paid TTS).
- UI language: Korean. App name: Howtowith.
- No paid APIs, servers, databases, or AI APIs. No unnecessary dependencies.

## Evidence on Hand

Howtowith.xlsx (one sheet, 11 pairs) is the only real content. No testimonials, users, or metrics exist; none may be invented.

## Product Principles

1. Today's cards first: the main action is always one tap away.
2. The owner's learning history is sacred: imports never overwrite it, backups are prominent.
3. Fast and quiet: operate-mode UI, readable at a glance, one hand.
4. Free and local by construction.

## Accessibility & Inclusion

Readable in dim light (dark mode) and sunlight; touch targets at least 44px; respects reduced-motion; Korean text must never be clipped.
