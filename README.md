# Vocall

**A passive, popup-based vocabulary companion for Windows** — it slips review cards into the gaps of your day instead of asking you to sit down and study.

<p>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-0078D6">
  <img alt="Electron" src="https://img.shields.io/badge/Electron-40-47848F?logo=electron&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white">
  <img alt="Tailwind" src="https://img.shields.io/badge/Tailwind-v4-38BDF8?logo=tailwindcss&logoColor=white">
</p>

[中文文档](./README.zh-CN.md) · [Changelog](./CHANGELOG.md)

---

## What is this?

Vocall lives in your system tray and, on an interval you choose, quietly pops a single flashcard into the corner of your screen — while you're gaming, watching something, or doing homework. Glance at the word, flip the card, grade yourself, and it disappears. Over time, the in-between minutes turn into vocabulary.

There's no "open the app and study" session. The app comes to you.

## Features

- **Popup review** — a card surfaces on a timer or on a global hotkey; the window hides to the tray instead of quitting, so it's always there but never in the way.
- **Pop-count SRS** — a scheduler built on *number of popups* rather than wall-clock time. Forgotten words come back sooner, remembered words stretch further apart, and mastered words stop appearing.
- **5 built-in wordbooks (1,580 words)** — organized by topic, with word-family and root clustering and multi-sense definitions.
- **Pronunciation** — real human voice via Youdao, British or American accent, on both the popup and the word list.
- **Statistics** — an at-a-glance page with accuracy trend, daily volume, and mastery distribution, drawn as clean hand-rolled SVG charts.
- **Expression Coach** — polish an English sentence for writing or speaking, or translate Chinese into natural English, with optional linkage to the words you're currently learning.
- **AI translation & generation** (optional) — let an AI fill in definitions and example sentences, or generate a themed word set.
- **Multi-provider model config** — bring your own key; multiple providers with OpenAI- or Gemini-compatible protocols, each with a "currently active" switch.
- **Recycle bin** — deleted words land in a restorable bin instead of vanishing.
- **Appearance** — independent sliders for window size, popup font, and opacity, with switchable color themes.
- **Forgetting tracker** — words you've marked "forgot" accumulate a count and are flagged in the list.
- **Duplicate guard** — a word already in your library or recycle bin can't be re-imported.

## Install

1. Download `Vocall-<version>-portable.exe` from [Releases](../../releases).
2. Run it — no installation needed.
3. On first launch a few built-in words are imported; closing the window leaves Vocall resident in the system tray.

> Fully local: no backend, no account, no telemetry. AI and pronunciation need a network connection; AI features require your own API key (optional — the wordbooks and popup review work without one).

## Quick start

1. **Add a wordbook** — open the manager → 「词书」 → pick a book → check words and add them.
2. **Bind a hotkey** — 「设置」 → set a global hotkey to summon a card anytime (default Ctrl+Shift+W).
3. **Start reviewing** — cards appear on their own. Read the word, flip for the definition and example, then grade yourself (Forgot / Fuzzy / Know) and the scheduler handles the rest.

## Data & updates

| | |
|---|---|
| **Data location** | `C:\Users\<you>\AppData\Roaming\Vocall\config.json` — survives reinstalls; copy the whole `Vocall` folder to migrate. |
| **Updates** | 「设置」 → 关于 → 检查更新 (checks GitHub Releases for the latest version). |

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Electron 40 |
| UI | React 19 + TypeScript + Tailwind v4 |
| Storage | electron-store (local JSON) |
| Build | electron-vite |
| Tests | Vitest |

## Development

```bash
npm install
npm run dev    # dev mode, opens the manager window
npm run build  # build to out/
npm run dist   # package a portable exe to dist/
npm test       # vitest
```

---

Vocall is a personal learning project. Feedback and issues are welcome.
