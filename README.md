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

- **MathML → LaTeX reconstruction** — even pure MathML without annotations gets converted
- **13-level fallback chain** — tries every possible extraction method
- **Visual feedback** — hover highlight + "Copied!" toast notification
- **Dynamic content** — MutationObserver + periodic scan for SPAs
- **iframe support** — `all_frames: true` for embedded content
- **No CSP violations** — uses MV3 `"world": "MAIN"` instead of inline script injection

## Install

1. Clone this repo or download as ZIP
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the project folder

## How It Works

```
content.js  (ISOLATED world) → detects formulas, handles UI/click/copy
page-script.js (MAIN world)  → accesses window.MathJax API, stamps data-lcm-tex
```

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

## License

MIT
