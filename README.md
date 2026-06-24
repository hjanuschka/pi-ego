# pi-ego

A persistent **browser-session layer** for the [ego-lite](https://github.com/citrolabs/ego-lite)
`ego-browser` skill. Where the skill is just a prompt that drives the browser
through one opaque `bash` call, pi-ego turns every browse into indexed,
browsable, replayable session state.

It works whether the agent drives the browser with raw `ego-browser nodejs`
heredocs **or** the `ego_*` tools this extension registers.

## Install

Requires the [ego-lite](https://github.com/citrolabs/ego-lite) app + `ego-browser`
skill, and the Pi coding agent.

As a Pi package via `settings.json`:

```json
{
  "packages": ["git:github.com/hjanuschka/pi-ego@main"]
}
```

Or drop it in as a local extension:

```bash
git clone https://github.com/hjanuschka/pi-ego ~/.pi/agent/extensions/pi-ego
```

(the entry point is `src/index.ts`).

## What it does

A `tool_result` hook watches bash/`ego_*` output and the script source, and
indexes:

- **Screenshots** -- copied into `<cwd>/.pi/ego/<sessionId>/shots/` with URL,
  title, timestamp, and task space.
- **Navigations** -- from logged `pageInfo()` and from `openOrReuseTab(...)` etc.
- **Task spaces** -- `useOrCreateTaskSpace` / `completeTaskSpace` / `handOff...`
  lifecycle.

Everything persists to `index.json`, so the views survive `/reload`.

## Commands

| Command | What |
|---|---|
| `/ego-gallery` (`ctrl+g`) | Filmstrip overlay of every screenshot. Inline image + URL/title/time. `←/→` browse, `o` open file, `e` export, `Esc` close. |
| `/ego-spaces` | Dashboard of task spaces (open/closed, event counts, last URL) + recent nav trail. |
| `/ego-export` | Self-contained HTML report (base64-embedded shots + space timeline), opened in the browser. |
| `/ego-learn` | Distill a visited domain into a reusable ego-lite *learnings* pack under `~/agent-config/skills/ego-browser-learnings/`. |
| `/ego-inline` | Toggle inline screenshot thumbnails in the transcript. |

## Tools (callable by the model)

- `ego_open(url)` -- open/reuse a URL in the agent task space, return pageInfo + snapshot.
- `ego_snapshot()` -- fresh semantic snapshot of the current page.
- `ego_screenshot(full?)` -- capture a PNG (auto-added to the gallery).
- `ego_click(target, label?)` -- click a selector/ref/locator, re-snapshot.

## Flags

- `--ego-inline` -- start with inline thumbnails on.
- `--ego-autocapture` -- after an ego navigation that produced no screenshot,
  auto-grab one by reusing the agent task space.

## Notes

- Inline images and the gallery render in image-capable terminals (Kitty,
  iTerm2, Ghostty, WezTerm, Warp); elsewhere they degrade to text.
- Storage lives under `.pi/` which is gitignored.
