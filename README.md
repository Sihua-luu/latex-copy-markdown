# LaTeX Copy Markdown

A Chrome extension that lets you **click on any LaTeX math formula** on a webpage to instantly copy its Markdown source (`$...$` or `$$...$$`) to your clipboard.

## Features

- **Single-click copy** — click any formula, get the Markdown source
- **Universal coverage** — works across all major math rendering methods:

| Renderer | Support |
|---|---|
| KaTeX | ✅ |
| MathJax v2 (HTML-CSS, SVG, CHTML) | ✅ |
| MathJax v3 | ✅ |
| Native MathML | ✅ (auto-converts to LaTeX) |
| Gemini / aria-label formulas | ✅ |
| Image-based formulas (img alt) | ✅ |
| Wikipedia `.mwe-math-element` | ✅ |
| Shadow DOM (Web Components) | ✅ |
| Custom `data-*` attributes | ✅ |

- **MathML → LaTeX reconstruction** — even pure MathML without annotations gets converted, including `menclose`, `mmultiscripts`, and smart matrix environment detection (`pmatrix`, `bmatrix`, `vmatrix`, etc.)
- **13-level fallback chain** — tries every possible extraction method
- **Visual feedback** — hover highlight + "Copied!" toast notification (Shadow DOM isolated)
- **Editor-safe** — does not interfere with contenteditable areas, `<textarea>`, or rich text editors (ProseMirror, Slate, CodeMirror, etc.)
- **Dynamic content** — MutationObserver + low-frequency fallback scan for SPAs
- **iframe support** — `all_frames: true` for embedded content
- **No CSP violations** — uses MV3 `"world": "MAIN"` instead of inline script injection
- **Minimal permissions** — no `activeTab` or host permissions beyond content script injection

## Install

1. Clone this repo or download as ZIP
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the project folder

## How It Works

```
content.js  (ISOLATED world) → detects formulas, handles UI/click/copy
page-script.js (MAIN world)  → accesses window.MathJax API, stamps data-lcm-tex
content.css                   → hover highlight & toast host styles
```

### Architecture

- **Event delegation** — a single capture-phase `click` listener on `window` (no `stopPropagation`) handles all formula clicks, instead of per-element listeners. This avoids memory leaks in SPAs and does not interfere with page event handlers.
- **Shadow DOM toast** — the "Copied!" notification lives inside a closed Shadow DOM, fully isolated from page styles.
- **Fixed positioning** — toast uses `position: fixed` with `clientX/clientY`, immune to CSS transforms and scroll offsets.
- **Editor protection** — `isInsideEditable()` checks both at attach-time and at click-time, so formulas that dynamically enter editable areas (common in SPAs) are correctly skipped.

### Extraction Priority

```
1.  MathJax API stamp (data-lcm-tex)
2.  KaTeX annotation
3.  Shadow root annotation
4.  data-* attributes (ancestor walk, 5 levels)
5.  MathJax Element ID → script lookup
6.  MathJax v3 alttext
7.  aria-label
8.  title attribute
9.  Image alt text
10. MathML → LaTeX reconstruction
11. SVG data attributes
12. Adjacent JSON <script>
13. Parent aria-label / title
```

## Changelog

### v2.2

- **Fix: clicking a formula did nothing on many sites** — the delegated click listener is now registered in the capture phase on `window` (still without `stopPropagation`). In v2.1 it was a bubble-phase listener on `document`, so any page handler calling `stopPropagation()` (ChatGPT, Gemini, many React/Vue apps) swallowed the click: hover highlight worked, but nothing was copied and no toast appeared.
- **Copy: caret-safe synchronous path first** — copies via `execCommand('copy')` + an intercepted `copy` event (no focus or selection change), then falls back to `navigator.clipboard.writeText`, then the hidden-textarea method. Page `copy` handlers can no longer overwrite the copied LaTeX.
- **Shadow DOM targets** — clicks are resolved through `composedPath()`, so formulas inside shadow roots are found reliably.

### v2.1

- **Fix: caret jumping in editors** — resolved persistent caret-reset-to-start bug when copying formulas while using contenteditable editors. Root causes: capture-phase `stopPropagation()` blocked editor click events; `execCopy` focus restoration corrupted caret position.
- **Performance: reduced polling** — `setInterval` frequency lowered from 2–2.5s to 15s; MutationObserver handles real-time updates.
- **Performance: optimized DOM queries** — combined N selector queries into a single `querySelectorAll`; replaced `querySelectorAll('*')` shadow root scan with targeted candidate queries.
- **Memory: event delegation** — replaced per-element `mouseenter`/`mouseleave`/`click` listeners with a single delegated `click` handler and CSS `:hover` rules.
- **Styles: CSS classes instead of inline styles** — hover highlight and flash effects now use `[data-lcm-attached]` and `.lcm-flash` CSS rules.
- **Toast: Shadow DOM isolation** — toast notification moved into a closed Shadow DOM to prevent style leakage in both directions.
- **Toast: fixed positioning** — uses `position: fixed` + `clientX/clientY`, fixing incorrect placement inside CSS-transformed containers.
- **MathML: expanded coverage** — added `menclose` (→ `\boxed`, `\cancel`), `mmultiscripts` (prescripts/postscripts), smart `mtable` environment detection based on surrounding `mfenced` delimiters, `mfrac` linethickness=0 support, and 30+ additional symbol mappings (Greek variants, arrows, set operators).
- **Security: input validation** — added `MAX_COPY_LENGTH` guard and type checking for JSON script extraction.
- **Debug: structured logging** — all `catch` blocks now route through `warn()` (enabled via `DEBUG` flag) instead of silently swallowing errors.
- **Manifest: removed unused `activeTab` permission.**
- **Code: modernized to ES2017+** — `let`/`const`, arrow functions, template-friendly style (targeting Chrome 88+ required by MV3).

### v2.0

- Initial public release.

## License

MIT
