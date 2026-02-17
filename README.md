# Preset Cache Analyzer — SillyTavern Extension

Analyzes your SillyTavern API preset for prompt caching inefficiencies.
Helps you get better cache hit rates with Claude, GPT-4, and Gemini.

## Installation

**Option A — Install via SillyTavern UI:**
1. Open SillyTavern → Extensions → Install Extension
2. Paste the repository URL and click Install

**Option B — Manual install:**
1. Clone or copy this repository into:
   ```
   SillyTavern/data/default-user/extensions/SillyTavern-Preset-Analyzer/
   ```
2. Restart SillyTavern
3. Enable the extension in Extensions panel

## What It Checks

- **Dynamic Macros** — Flags `{{random}}`, `{{time}}`, `{{roll}}`, etc. in early prompt positions that bust the cache prefix
- **Prompt Ordering** — Detects volatile content (chat history) interleaved between stable sections
- **Token Thresholds** — Warns when stable prefix falls below provider's cache activation minimum
- **Injection Depth** — Flags shallow-depth injections that shift the message array
- **Provider-Specific** — Checks for system message squashing (Anthropic), 128-token alignment (OpenAI), minimum cache size (Gemini)

## Usage

- Click **Analyze** in the extension panel
- Or use slash commands: `/cache-analyze` or `/cache-score`
- Extension auto-analyzes when you change presets (can be disabled in settings)

## Score Ranges

| Score    | Rating     | Description                       |
|----------|------------|-----------------------------------|
| 90-100   | Excellent  | Cache efficiency is optimal       |
| 70-89    | Good       | Minor improvements possible       |
| 50-69    | Needs Work | Several issues found              |
| 0-49     | Poor       | Significant cache waste           |

## Running Tests

```bash
node tests/run-all.js
```

## License

MIT
