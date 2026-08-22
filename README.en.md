# dsh-worldbook

**English** | [简体中文](README.md)

A World Info (Lorebook) plugin for DeepSeek Harness.

---

## What This Project Does

- **Use World Books**: Create, import, edit, and export world books, with an injection mechanism that attaches a set of background lore to the AI.
- **SillyTavern Compatible**: SillyTavern world book JSON files can be imported directly, with field and injection semantics aligned.
- **Let the AI Maintain the Lore**: With "World Book Dev Mode" enabled, the AI can create world books and add/remove/edit entries on its own — ideal for roleplay/creative workspaces.

## Overview

This plugin brings SillyTavern's World Info into DSH and adds two practical capabilities on top: **letting the AI write world books itself** and **permission control for edits**.

Currently only the PC web UI is developed; mobile UI is not yet adapted.

DeepSeek Harness version: **0.1.0-rc.8**. Other versions are untested.

## Key Features

| Feature | Description |
| --- | --- |
| 🗂️ SillyTavern-compatible world books | Import/export ST JSON, fully aligned fields and injection semantics, a fairly complete injection system |
| 🤖 World Book Dev Mode | Let the AI write world books itself, with configurable add/delete/edit/query permissions, and control which world book the AI can edit |
| 🎨 UI Themes | Follow the DSH theme, or use an independent pink theme |
| 🧩 Integrable | Both the world book management page and the settings card can be embedded into your own plugin |

---

## Installation & Updates

> Prerequisites: Node.js ≥ 22.18 and pnpm installed (`dsh plugin` forwards arguments to pnpm). Plugin data (the SQLite world book database) is stored in `~/.dsh/worldbook/` and is identical regardless of install method.

### Method 1: Install via the official dsh CLI (recommended)

If the `dsh` CLI is installed globally, run:

```bash
dsh plugin --profile web add github:aam452/dsh-worldbook
```

- To update the plugin:

```bash
dsh plugin --profile web update dsh-worldbook
```

- To uninstall the plugin:

```bash
dsh plugin --profile web remove dsh-worldbook
```

### Method 2: Script install (via `link:` for local development)

Recommended for local development. `link:` points to the local project directory, so changes take effect immediately after `npm run build` — no commit/publish needed to verify.

**Via the command line:**

```bash
git clone https://github.com/aam452/dsh-worldbook
cd dsh-worldbook
powershell -ExecutionPolicy Bypass -File .\link-install.ps1 web -Method 1
```

**Via double-clicking the script:**

1. Download the project and open the `dsh-worldbook` directory.
2. Double-click `link-install.ps1` (Windows will ask how to open it — choose PowerShell).
3. Follow the prompt (soft-link install); if the plugin is already installed, the script will tell you to uninstall first.

> Notes:
> - The script first runs `npm run build` to produce the latest `lib/`, then uses `dsh plugin --profile web add link:G:/projects/dsh-worldbook` to create the soft link.
> - In non-interactive terminals (e.g. CI/scripts) you must explicitly pass `-Method 1|2|3`, otherwise the script aborts with an error: `1`=soft-link install, `2`=GitHub install, `3`=update plugin.
> - After changing code, just `npm run build` and restart dsh for changes to take effect; to publish, push to GitHub and run `dsh plugin --profile web update dsh-worldbook`.

### Method 3: Install via npx

Without a global install, use `npx` to pull the latest CLI:

```bash
npx -p @deepseek-ai/dsh@latest dsh plugin --profile web add github:aam452/dsh-worldbook
npx -p @deepseek-ai/dsh@latest dsh --profile web
```

---

## Quick Start

1. **Enable**: In DSH Settings → Plugins, enable this plugin.
2. **Create a book**: Open the "World Book" page, create a new one, or directly import a SillyTavern world book JSON.
3. **Edit entries**: Select a world book, add an entry, and fill in keywords and content.

> The settings page offers options such as "Enable Toggle", "Active Workspace", "Theme", "Injection Timing", and "World Book Dev Mode" — adjust them as needed.

### Injection Behavior Compatibility with SillyTavern World Books

Based on the actual implementation of the injection engine (`src/context/`), behavior is split into two categories: **real injection implemented** and **format-only compatibility (storage/import-export, no effect on injection yet)**.

#### Real Injection Implemented

| Behavior | Description |
| --- | --- |
| Keyword triggering | Inject on primary keyword match (substring / whole word / regex) |
| Selective | After primary key matches, filter by the combination logic of secondary keywords (`selectiveLogic`) |
| Constant | `constant` entries are always injected unconditionally |
| Delay | Force injection within the first few messages of a session |
| Sticky | Force injection within a few messages after a match |
| Cooldown | Suppress injection within a few messages after a match |
| Probability | Decide per occurrence whether to inject, based on a percentage |
| Recursive scanning | Keywords inside already-injected content can trigger other entries (up to 5 levels) |
| Recursion control | `excludeRecursion` (skip this recursion round) / `preventRecursion` (content not added to the recursion buffer) / `delayUntilRecursion` |
| Group mutual exclusion | Within the same group (`group`), take one entry by `order`; `groupOverride` can force an override |
| Position / ordering | Group by `position`, sort by `order` within group, then inject |
| @D deep insertion | Entries with `position=@D` are inserted into the chat at the specified depth (same-depth entries merged into one) |

> The time cursor for injection aligns with ST's `chat.length` (advances only with real conversation messages), keeping cross-turn behaviors (sticky/cooldown/delay) consistent with SillyTavern.

#### Format-Only Compatibility (Storage / Import-Export, No Injection Logic Yet)

The following fields can be imported, edited, exported, and round-tripped, but **do not currently participate in injection decisions**:

| Field | Description |
| --- | --- |
| `vectorized` | No real vector retrieval; currently treated as constant |
| `groupWeight` | Preserved; group mutual exclusion uses only `order`, not group weight |
| `scanDepth` (entry-level) | Preserved; the actual scan window uses a fixed depth (last 2 messages); entry-level setting has no effect |
| `role` | Preserved; deep insertion works for @D entries, but the message role is always "user" |
| `outletName` / `automationId` / `triggers` / `matchPersonaDescription` etc. | Preserved, no injection logic |

Two additional notes:

- `characterFilter` (entry-level character filtering) **does** have real injection logic: it takes effect only when the host provides a "current character" context (`worldbook.characterContext`, the character-card binding compat layer); without a character context, no filtering is applied and all entries are injected.
- For non-@D entries, `position` only affects **injection order** (internal message ordering); unlike ST, content is not placed into different prompt regions (character definition / example messages / author's note, etc.); regular-position entries are all appended at the end of the context.

---

## Secondary Development / Integration

If you want more than out-of-the-box usage:

- **Add features / change injection logic / extend the data model**;
- **Integrate the world book UI into your own plugin**: world book management page + plugin settings card, wired through DSH slots;
- **Use only its capabilities**: call the injection engine directly, or read/write world books via the REST API.

See **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** for details.

---

## Settings Overview

The following can be configured in the plugin's "Settings":

| Setting | Description |
| --- | --- |
| Enable Toggle | World books no longer inject when disabled |
| Active Workspace | Choose the DSH workspace: all workspaces / only the specified workspace |
| Theme | Follow the DSH theme / independent pink theme |
| Injection Timing | Body injection (default) / per-turn injection (not recommended, may duplicate) |
| World Book Dev Mode | Expose world book editing tools to the AI when enabled |
| AI Permissions | Control which operations the AI can add / delete / edit / query |

---

## Known Limitations

- This is a world book plugin only; there is no "character card" concept, and it cannot be bound to character cards.
- When enabled alongside other world book plugins, configure carefully; do not enable the same world book in both, or content will be injected twice. Enabling other world book plugins/features simultaneously is not recommended.
- In Dev Mode, the AI's world book editing scope/permissions are currently **book-level** (managed per world book), and **entry-level** permission control is not implemented.
- No prompt for World Book Dev Mode is pre-configured. When using dev features to develop a world book, it is recommended to configure one first — write your own or import a "world book about writing world books" constraint field usage scenario and provide writing guidance, e.g. "world book entries must be non-recursive", as the prompt.
- In World Book Dev Mode, the AI's edit scope is constrained by "Dev Mode" and "AI Permissions" — this is a safety design.

---

## Development / Build

```bash
npm install
npm run build        # builds the host half + client half
npm run typecheck    # type checking
npm run test:worldbook  # smoke tests for core logic
```

Tech stack: TypeScript / Cordis / React, with an independent SQLite database.

---

## License

[MIT](LICENSE)

---

## Acknowledgments

The semantics of SillyTavern's World Info are the reference this project aligns its behavior with.
