(function () {
  'use strict';

  if (!document.body || !document.documentElement) return;

  const PROCESSED = 'data-lcm-attached';
  const DEBUG = false; // flip to true for development logging

  function warn(msg, err) {
    if (DEBUG && console && console.warn) {
      console.warn('[LCM]', msg, err || '');
    }
  }

  // ─── Toast (Shadow-DOM isolated) ────────────────────────────────────────

  let toastHost = null;
  let toastShadow = null;
  let toastEl = null;
  let toastTimer = null;

  function ensureToast() {
    if (toastHost && document.body.contains(toastHost)) return;
    toastHost = document.createElement('div');
    toastHost.id = 'lcm-toast-host';
    toastShadow = toastHost.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      .lcm-toast {
        position: fixed;
        padding: 6px 14px;
        background: #1a1a2e;
        color: #a6e3a1;
        border: 1px solid #40a87b;
        border-radius: 6px;
        font: 600 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        white-space: nowrap;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        pointer-events: none;
        opacity: 0;
        transform: translateY(4px);
        transition: opacity 0.15s ease, transform 0.15s ease;
        z-index: 2147483647;
      }
      .lcm-toast.show {
        opacity: 1;
        transform: translateY(0);
      }
      .lcm-toast.error {
        color: #f38ba8;
        border-color: #f38ba8;
      }
    `;
    toastShadow.appendChild(style);
    toastEl = document.createElement('div');
    toastEl.className = 'lcm-toast';
    toastShadow.appendChild(toastEl);
    document.body.appendChild(toastHost);
  }

  function showToast(clientX, clientY, text, ok) {
    try {
      if (!document.body) return;
      ensureToast();

      clearTimeout(toastTimer);
      toastEl.textContent = text;
      toastEl.className = 'lcm-toast' + (ok ? '' : ' error');

      // Position using fixed coordinates (immune to transforms & scroll)
      requestAnimationFrame(() => {
        let left = clientX + 14;
        let top = clientY - toastEl.offsetHeight - 10;
        if (left + toastEl.offsetWidth > window.innerWidth - 8) {
          left = clientX - toastEl.offsetWidth - 14;
        }
        if (top < 4) top = clientY + 18;
        toastEl.style.left = left + 'px';
        toastEl.style.top = top + 'px';
        toastEl.classList.add('show');
      });

      toastTimer = setTimeout(() => {
        toastEl.classList.remove('show');
      }, 1600);
    } catch (e) { warn('showToast failed', e); }
  }

  // ─── Copy ──────────────────────────────────────────────────────────────────

  function copyText(text, mx, my) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => showToast(mx, my, 'Copied!', true))
        .catch(() => execCopy(text, mx, my));
    } else {
      execCopy(text, mx, my);
    }
  }

  function isEditableElement(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    return tag === 'TEXTAREA' || tag === 'INPUT';
  }

  function execCopy(text, mx, my) {
    try {
      if (!document.body) return;
      const prevFocus = document.activeElement;
      const prevSel = window.getSelection();
      const savedRange = prevSel && prevSel.rangeCount > 0 ? prevSel.getRangeAt(0).cloneRange() : null;

      // If the user was in an editable element, do NOT restore focus after copy.
      // Calling .focus() on a contenteditable puts the caret at position 0,
      // and range restoration often fails silently — leaving the caret stuck.
      // Instead, let the user click where they want to paste.
      const wasInEditable = isEditableElement(prevFocus);

      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('style', 'position:fixed;top:-9999px;left:-9999px;opacity:0');
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();

      // Only restore focus/selection for non-editable elements.
      // For editable elements, restoring would corrupt the caret position.
      if (!wasInEditable) {
        if (prevFocus && prevFocus.focus) {
          try { prevFocus.focus(); } catch (_) { /* noop */ }
        }
        if (savedRange) {
          try {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(savedRange);
          } catch (_) { /* noop */ }
        }
      }
      showToast(mx, my, ok ? 'Copied!' : 'Failed', ok);
    } catch (e) {
      warn('execCopy failed', e);
      showToast(mx, my, 'Failed', false);
    }
  }

  // ─── MathML → LaTeX reconstruction ──────────────────────────────────────

  const MO_MAP = {
    '\u2200': '\\forall', '\u2203': '\\exists', '\u2204': '\\nexists',
    '\u2205': '\\emptyset',
    '\u2208': '\\in', '\u2209': '\\notin', '\u220B': '\\ni',
    '\u2211': '\\sum', '\u220F': '\\prod', '\u2210': '\\coprod',
    '\u222B': '\\int', '\u222C': '\\iint', '\u222D': '\\iiint', '\u222E': '\\oint',
    '\u2218': '\\circ', '\u2219': '\\cdot', '\u00B7': '\\cdot',
    '\u00D7': '\\times', '\u00F7': '\\div',
    '\u2227': '\\land', '\u2228': '\\lor', '\u00AC': '\\neg', '\u2192': '\\to',
    '\u2190': '\\leftarrow', '\u21D2': '\\Rightarrow', '\u21D4': '\\Leftrightarrow',
    '\u2194': '\\leftrightarrow', '\u21D0': '\\Leftarrow',
    '\u2191': '\\uparrow', '\u2193': '\\downarrow',
    '\u21D1': '\\Uparrow', '\u21D3': '\\Downarrow',
    '\u2264': '\\le', '\u2265': '\\ge', '\u2260': '\\ne',
    '\u226A': '\\ll', '\u226B': '\\gg',
    '\u2248': '\\approx', '\u2261': '\\equiv', '\u221D': '\\propto',
    '\u2245': '\\cong', '\u2243': '\\simeq', '\u223C': '\\sim',
    '\u2282': '\\subset', '\u2283': '\\supset', '\u2286': '\\subseteq', '\u2287': '\\supseteq',
    '\u222A': '\\cup', '\u2229': '\\cap',
    '\u221E': '\\infty', '\u2202': '\\partial', '\u2207': '\\nabla',
    '\u221A': '\\sqrt', '\u2016': '\\|',
    // Greek lowercase
    '\u03B1': '\\alpha', '\u03B2': '\\beta', '\u03B3': '\\gamma', '\u03B4': '\\delta',
    '\u03B5': '\\epsilon', '\u03B6': '\\zeta', '\u03B7': '\\eta', '\u03B8': '\\theta',
    '\u03B9': '\\iota', '\u03BA': '\\kappa', '\u03BB': '\\lambda', '\u03BC': '\\mu',
    '\u03BD': '\\nu', '\u03BE': '\\xi', '\u03C0': '\\pi', '\u03C1': '\\rho',
    '\u03C2': '\\varsigma', '\u03C3': '\\sigma', '\u03C4': '\\tau',
    '\u03C5': '\\upsilon', '\u03C6': '\\phi', '\u03C7': '\\chi',
    '\u03C8': '\\psi', '\u03C9': '\\omega',
    // Greek variant forms
    '\u03D5': '\\varphi', '\u03F5': '\\varepsilon', '\u03D1': '\\vartheta',
    '\u03F0': '\\varkappa', '\u03D6': '\\varpi', '\u03F1': '\\varrho',
    // Greek uppercase
    '\u0393': '\\Gamma', '\u0394': '\\Delta', '\u0398': '\\Theta', '\u039B': '\\Lambda',
    '\u039E': '\\Xi', '\u03A0': '\\Pi', '\u03A3': '\\Sigma', '\u03A6': '\\Phi',
    '\u03A8': '\\Psi', '\u03A9': '\\Omega', '\u03A5': '\\Upsilon',
    // Dots
    '\u2026': '\\ldots', '\u22EF': '\\cdots', '\u22EE': '\\vdots', '\u22F1': '\\ddots',
    '\u2032': "'", '\u2033': "''",
    '\u00B1': '\\pm', '\u2213': '\\mp',
    '\u2223': '\\mid', '\u2225': '\\parallel', '\u22A5': '\\perp',
    '\u2220': '\\angle', '\u2221': '\\measuredangle',
    // Set & logic extras
    '\u2234': '\\therefore', '\u2235': '\\because',
    '\u22C0': '\\bigwedge', '\u22C1': '\\bigvee',
    '\u2295': '\\oplus', '\u2297': '\\otimes', '\u2299': '\\odot',
    '\u22C5': '\\cdot', '\u2217': '\\ast', '\u2605': '\\star',
    '\u2113': '\\ell', '\u210F': '\\hbar', '\u2111': '\\Im', '\u211C': '\\Re',
    '\u2135': '\\aleph',
  };

  const FENCE_MAP = {
    '(': '(', ')': ')', '[': '[', ']': ']',
    '{': '\\{', '}': '\\}', '|': '|', '\u2016': '\\|',
    '\u2329': '\\langle', '\u232A': '\\rangle',
    '\u27E8': '\\langle', '\u27E9': '\\rangle',
    '\u230A': '\\lfloor', '\u230B': '\\rfloor',
    '\u2308': '\\lceil', '\u2309': '\\rceil',
  };

  // Determine matrix environment from surrounding fences
  function matrixEnv(node) {
    const parent = node.parentElement;
    if (!parent) return 'matrix';
    const tag = parent.tagName.toLowerCase().replace(/^m:/, '');
    if (tag === 'mfenced') {
      const open = parent.getAttribute('open') || '(';
      const close = parent.getAttribute('close') || ')';
      if (open === '(' && close === ')') return 'pmatrix';
      if (open === '[' && close === ']') return 'bmatrix';
      if (open === '{' && close === '}') return 'Bmatrix';
      if (open === '|' && close === '|') return 'vmatrix';
      if (open === '\u2016' && close === '\u2016') return 'Vmatrix';
    }
    return 'matrix';
  }

  function mathml2latex(node) {
    if (!node) return '';
    if (node.nodeType === 3) return node.textContent.trim();
    if (node.nodeType !== 1) return '';

    const tag = node.tagName.toLowerCase().replace(/^m:/, '');
    const children = [];
    for (let c = node.firstChild; c; c = c.nextSibling) children.push(c);

    const kids = () => children.map(mathml2latex).join('');
    const kid = (i) => i < children.length ? mathml2latex(children[i]) : '';
    const brace = (i) => { const k = kid(i); return k.length > 1 ? '{' + k + '}' : k; };

    switch (tag) {
      case 'math': case 'mrow': case 'mstyle': case 'mpadded': case 'merror': case 'semantics':
        return kids();
      case 'mi': case 'mn': {
        const txt = node.textContent.trim();
        return MO_MAP[txt] || txt;
      }
      case 'mo': {
        const op = node.textContent.trim();
        return MO_MAP[op] || op;
      }
      case 'mtext': {
        const mt = node.textContent.trim();
        return mt ? '\\text{' + mt + '}' : '';
      }
      case 'mspace':
        return '\\;';
      case 'mfrac': {
        // Check for bevelled/linear fraction
        const bev = node.getAttribute('bevelled') || node.getAttribute('linethickness');
        if (bev === '0') return brace(0) + '/' + brace(1); // binomial-style no line
        return '\\frac' + brace(0) + brace(1);
      }
      case 'msup':
        return kid(0) + '^' + brace(1);
      case 'msub':
        return kid(0) + '_' + brace(1);
      case 'msubsup':
        return kid(0) + '_' + brace(1) + '^' + brace(2);
      case 'munder':
        return kid(0) + '_{' + kid(1) + '}';
      case 'mover': {
        const base = kid(0), over = kid(1);
        if (over === '\u0302' || over === '^') return '\\hat{' + base + '}';
        if (over === '\u0303' || over === '~') return '\\tilde{' + base + '}';
        if (over === '\u0304' || over === '\u00AF' || over === '-') return '\\overline{' + base + '}';
        if (over === '\u20D7' || over === '\u2192') return '\\vec{' + base + '}';
        if (over === '\u02D9' || over === '.') return '\\dot{' + base + '}';
        if (over === '..' || over === '\u00A8') return '\\ddot{' + base + '}';
        if (over === '\u23DE') return '\\overbrace{' + base + '}';
        return base + '^{' + over + '}';
      }
      case 'munderover':
        return kid(0) + '_{' + kid(1) + '}^{' + kid(2) + '}';
      case 'msqrt':
        return '\\sqrt{' + kids() + '}';
      case 'mroot':
        return '\\sqrt[' + kid(1) + ']{' + kid(0) + '}';
      case 'mfenced': {
        const open = node.getAttribute('open') || '(';
        const close = node.getAttribute('close') || ')';
        const sep = node.getAttribute('separators') || ',';
        const lo = FENCE_MAP[open] || open;
        const lc = FENCE_MAP[close] || close;
        // Check if child is mtable — if so, the fenced delimiters determine the env
        if (children.length === 1 && children[0].nodeType === 1) {
          const childTag = children[0].tagName.toLowerCase().replace(/^m:/, '');
          if (childTag === 'mtable') {
            return mathml2latex(children[0]);
          }
        }
        const parts = children.map(mathml2latex);
        return '\\left' + lo + parts.join(sep.charAt(0) + ' ') + '\\right' + lc;
      }
      case 'mtable': {
        const env = matrixEnv(node);
        const rows = [];
        for (let ri = 0; ri < children.length; ri++) {
          if (children[ri].nodeType === 1) {
            const cells = [];
            for (let ci = children[ri].firstChild; ci; ci = ci.nextSibling) {
              if (ci.nodeType === 1) cells.push(mathml2latex(ci));
            }
            rows.push(cells.join(' & '));
          }
        }
        return '\\begin{' + env + '}' + rows.join(' \\\\ ') + '\\end{' + env + '}';
      }
      case 'mtr': {
        const tds = [];
        for (let ti = 0; ti < children.length; ti++) {
          if (children[ti].nodeType === 1) tds.push(mathml2latex(children[ti]));
        }
        return tds.join(' & ');
      }
      case 'mtd':
        return kids();
      case 'mphantom':
        return '\\phantom{' + kids() + '}';
      case 'menclose': {
        const notation = node.getAttribute('notation') || 'longdiv';
        if (notation.includes('box')) return '\\boxed{' + kids() + '}';
        if (notation.includes('cancel') || notation.includes('updiagonalstrike'))
          return '\\cancel{' + kids() + '}';
        return kids(); // fallback — pass content through
      }
      case 'mmultiscripts': {
        // Basic mmultiscripts: base sub sup (before <mprescripts/>) presub presup
        const base = kid(0);
        let sub = '', sup = '';
        let preSub = '', preSup = '';
        let inPre = false;
        for (let i = 1; i < children.length; i++) {
          const c = children[i];
          if (c.nodeType === 1 && c.tagName.toLowerCase().replace(/^m:/, '') === 'mprescripts') {
            inPre = true;
            continue;
          }
          const val = mathml2latex(c);
          if (c.nodeType === 1 && c.tagName.toLowerCase().replace(/^m:/, '') === 'none') continue;
          if (inPre) {
            if (!preSub) preSub = val; else preSup = val;
          } else {
            if (!sub) sub = val; else sup = val;
          }
        }
        let result = '';
        if (preSub || preSup) result += '{}' + (preSub ? '_{' + preSub + '}' : '') + (preSup ? '^{' + preSup + '}' : '');
        result += base;
        if (sub) result += '_{' + sub + '}';
        if (sup) result += '^{' + sup + '}';
        return result;
      }
      case 'annotation':
        if (node.getAttribute('encoding') === 'application/x-tex') return node.textContent.trim();
        return '';
      case 'annotation-xml':
        return '';
      default:
        return kids();
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function wrapTex(raw, display) {
    const t = raw.trim();
    if (!t) return null;
    if (/^\$\$[\s\S]+\$\$$/.test(t)) return t;
    if (/^\\\[[\s\S]+\\\]$/.test(t)) return '$$' + t.slice(2, -2).trim() + '$$';
    if (/^\$(?!\$)[\s\S]+(?<!\$)\$$/.test(t)) {
      if (display) return '$' + t + '$';
      return t;
    }
    if (/^\\\([\s\S]+\\\)$/.test(t)) {
      const inner = t.slice(2, -2).trim();
      return display ? '$$' + inner + '$$' : '$' + inner + '$';
    }
    return display ? '$$' + t + '$$' : '$' + t + '$';
  }

  function looksLikeTex(s) {
    if (!s) return false;
    s = s.trim();
    return s.indexOf('\\') !== -1 || (s.charAt(0) === '$' && s.length > 2) ||
      /[_^{}]/.test(s) || /\\(?:frac|sqrt|sum|int|alpha|beta|gamma|pi|infty|left|right)/.test(s);
  }

  function checkDisplay(el) {
    try {
      if (el.getAttribute('data-lcm-display') === '1') return true;
      if (el.getAttribute('display') === 'true' || el.getAttribute('display') === 'block') return true;
      if (el.getAttribute('data-display') === 'true' || el.getAttribute('data-display') === 'block') return true;

      const dc = ['katex-display', 'MathJax_Display', 'MathJax_SVG_Display', 'math-display', 'display-math'];
      for (let i = 0; i < dc.length; i++) {
        if (el.classList && el.classList.contains(dc[i])) return true;
        if (el.parentElement && el.parentElement.classList && el.parentElement.classList.contains(dc[i])) return true;
      }

      // Walk up ancestors checking for display indicators
      let cur = el;
      for (let d = 0; d < 5 && cur && cur !== document.body; d++) {
        const cls = cur.className;
        if (typeof cls === 'string' && /\bdisplay\b/i.test(cls)) return true;
        if (cur.tagName && cur.tagName.toLowerCase() === 'mjx-container' &&
          cur.getAttribute('display') === 'true') return true;
        cur = cur.parentElement;
      }

      // closest() with expanded selectors
      if (el.closest && el.closest(
        '.katex-display,.MathJax_Display,.MathJax_SVG_Display,' +
        'mjx-container[display="true"],.math-display,.display-math'
      )) return true;

      // Heuristic: math element is the sole significant content of a block-level parent
      const parent = el.parentElement;
      if (parent) {
        const ptag = parent.tagName;
        if (ptag === 'P' || ptag === 'DIV' || ptag === 'SECTION' ||
          ptag === 'BLOCKQUOTE' || ptag === 'CENTER') {
          const siblings = parent.childNodes;
          let significantCount = 0;
          for (let si = 0; si < siblings.length; si++) {
            const sib = siblings[si];
            if (sib === el) { significantCount++; continue; }
            if (sib.nodeType === 3 && !sib.textContent.trim()) continue;
            significantCount++;
          }
          if (significantCount <= 1) return true;
        }
      }
    } catch (e) { warn('checkDisplay failed', e); }
    return false;
  }

  // Walk up to 5 ancestors looking for data attributes containing TeX
  const TEX_ATTRS = ['data-tex', 'data-formula', 'data-latex', 'data-katex', 'data-math',
    'data-expression', 'data-content', 'data-src', 'data-mathml'];

  function findTexInAncestors(el, maxDepth) {
    let cur = el;
    for (let d = 0; d < (maxDepth || 5) && cur && cur !== document.body; d++) {
      for (let i = 0; i < TEX_ATTRS.length; i++) {
        const v = cur.getAttribute(TEX_ATTRS[i]);
        if (v && looksLikeTex(v)) return v.trim();
      }
      cur = cur.parentElement;
    }
    return null;
  }

  function findAnnotation(root) {
    try {
      const a = root.querySelector('annotation[encoding="application/x-tex"]');
      return a ? a.textContent.trim() : null;
    } catch (e) { warn('findAnnotation failed', e); return null; }
  }

  // ─── Main extraction ──────────────────────────────────────────────────────

  const MAX_COPY_LENGTH = 10000; // reject suspiciously long content

  function extract(el) {
    try {
      const disp = checkDisplay(el);
      let tex;

      // 1. data-lcm-tex stamp from page-script.js
      const stamped = el.getAttribute('data-lcm-tex');
      if (stamped && stamped.trim()) {
        return wrapTex(stamped.trim(), el.getAttribute('data-lcm-display') === '1');
      }

      // 2. KaTeX annotation
      tex = findAnnotation(el);
      if (tex) return wrapTex(tex, disp);

      // 3. Shadow root
      if (el.shadowRoot) {
        tex = findAnnotation(el.shadowRoot);
        if (tex) return wrapTex(tex, disp);
      }

      // 4. data-* attributes on self + ancestors
      tex = findTexInAncestors(el, 5);
      if (tex) return wrapTex(tex, disp);

      // 5. MathJax ID → script
      const elId = el.id || '';
      if (elId.indexOf('MathJax-Element') !== -1) {
        const scriptId = elId.replace('-Frame', '');
        const scriptEl = document.getElementById(scriptId);
        if (scriptEl && scriptEl.nodeName === 'SCRIPT') {
          tex = scriptEl.textContent.trim();
          if (tex) return wrapTex(tex, scriptEl.type && scriptEl.type.indexOf('mode=display') !== -1);
        }
      }

      // 6. MathJax v3 alttext
      tex = el.getAttribute('alttext');
      if (tex && tex.trim()) return wrapTex(tex.trim(), disp);

      // 7. aria-label
      const lbl = el.getAttribute('aria-label');
      if (lbl && looksLikeTex(lbl)) return lbl.trim().charAt(0) === '$' ? lbl.trim() : wrapTex(lbl.trim(), disp);

      // 8. title attribute
      const title = el.getAttribute('title');
      if (title && looksLikeTex(title)) return wrapTex(title.trim(), disp);

      // 9. Image alt text
      if (el.tagName === 'IMG') {
        const alt = el.getAttribute('alt');
        if (alt && looksLikeTex(alt)) return alt.trim().charAt(0) === '$' ? alt.trim() : wrapTex(alt.trim(), disp);
      }
      const img = el.querySelector && el.querySelector('img[alt]');
      if (img) {
        const imgAlt = img.getAttribute('alt');
        if (imgAlt && looksLikeTex(imgAlt)) return imgAlt.trim().charAt(0) === '$' ? imgAlt.trim() : wrapTex(imgAlt.trim(), disp);
      }

      // 10. MathML reconstruction — <math> element
      let mathEl = null;
      if (el.tagName === 'math' || el.tagName === 'MATH') {
        mathEl = el;
      } else {
        mathEl = el.querySelector && el.querySelector('math');
      }
      if (!mathEl && el.shadowRoot) {
        mathEl = el.shadowRoot.querySelector('math');
      }
      if (mathEl) {
        const ann = mathEl.querySelector('annotation[encoding="application/x-tex"]');
        if (ann && ann.textContent.trim()) return wrapTex(ann.textContent.trim(), disp);
        const mathAlt = mathEl.getAttribute('alttext');
        if (mathAlt && mathAlt.trim()) return wrapTex(mathAlt.trim(), disp);
        tex = mathml2latex(mathEl);
        if (tex && tex.trim().length > 0) return wrapTex(tex.trim(), disp || mathEl.getAttribute('display') === 'block');
      }

      // 11. SVG data attributes
      let svg = null;
      if (el.tagName === 'svg' || el.tagName === 'SVG') {
        svg = el;
      } else {
        svg = el.querySelector && el.querySelector('svg');
      }
      if (svg) {
        for (let si = 0; si < TEX_ATTRS.length; si++) {
          tex = svg.getAttribute(TEX_ATTRS[si]);
          if (tex && looksLikeTex(tex)) return wrapTex(tex.trim(), disp);
        }
        const svgTitle = svg.querySelector('title');
        if (svgTitle && looksLikeTex(svgTitle.textContent)) return wrapTex(svgTitle.textContent.trim(), disp);
      }

      // 12. Adjacent JSON script (with validation)
      try {
        const nextSib = el.nextElementSibling;
        if (nextSib && nextSib.nodeName === 'SCRIPT' &&
          (nextSib.type === 'application/json' || nextSib.type === 'text/json' || nextSib.type === 'math/json')) {
          const raw = nextSib.textContent;
          if (raw && raw.length < MAX_COPY_LENGTH) {
            const json = JSON.parse(raw);
            tex = json.formula || json.latex || json.tex || json.math || json.content;
            if (typeof tex === 'string' && tex.length < MAX_COPY_LENGTH && looksLikeTex(tex)) {
              return wrapTex(tex.trim(), disp);
            }
          }
        }
      } catch (_) { /* JSON parse error — expected for non-math scripts */ }

      // 13. Parent aria-label / title
      const par = el.parentElement;
      if (par) {
        const parLabel = par.getAttribute('aria-label');
        if (parLabel && looksLikeTex(parLabel)) return parLabel.trim().charAt(0) === '$' ? parLabel.trim() : wrapTex(parLabel.trim(), disp);
        const parTitle = par.getAttribute('title');
        if (parTitle && looksLikeTex(parTitle)) return wrapTex(parTitle.trim(), disp);
      }

    } catch (e) { warn('extract failed', e); }
    return null;
  }

  // ─── Event delegation (replaces per-element listeners) ──────────────────

  function attach(el, src) {
    if (!src || el.hasAttribute(PROCESSED)) return;
    if (isInsideEditable(el)) return;
    el.setAttribute(PROCESSED, '1');
    el.setAttribute('data-lcm-source', src);
  }

  // Single delegated listener on document for all formula clicks.
  // Uses BUBBLE phase (not capture) so editors receive the event first.
  // Does NOT call stopPropagation — other handlers (editor focus management,
  // framework event systems like React) must still see the event.
  document.addEventListener('click', function (e) {
    const el = e.target.closest('[' + PROCESSED + ']');
    if (!el) return;

    // Runtime editable check: the element may have been processed before
    // the parent became contenteditable (common in SPAs).
    if (isInsideEditable(el)) {
      // Clean up: remove the attachment so we don't re-check every click
      el.removeAttribute(PROCESSED);
      el.removeAttribute('data-lcm-source');
      return;
    }

    e.preventDefault();
    // Intentionally no stopPropagation — page event handlers must not be blocked
    el.classList.add('lcm-flash');
    setTimeout(() => el.classList.remove('lcm-flash'), 200);
    copyText(el.getAttribute('data-lcm-source'), e.clientX, e.clientY);
  });

  function updateStamped() {
    try {
      const attached = document.querySelectorAll('[' + PROCESSED + ']');
      for (let i = 0; i < attached.length; i++) {
        const el = attached[i];
        const stamp = el.getAttribute('data-lcm-tex');
        if (!stamp) continue;
        const newSrc = wrapTex(stamp.trim(), el.getAttribute('data-lcm-display') === '1');
        const oldSrc = el.getAttribute('data-lcm-source');
        if (newSrc && newSrc !== oldSrc) el.setAttribute('data-lcm-source', newSrc);
      }
    } catch (e) { warn('updateStamped failed', e); }
  }

  // ─── Text-based LaTeX scanner ─────────────────────────────────────────

  const SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, NOSCRIPT: 1, CODE: 1, PRE: 1 };

  function isInsideEditable(el) {
    let cur = el;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      if (cur.isContentEditable) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  // Regex that avoids matching escaped dollars: uses [^\\] lookbehind
  const INLINE_DOLLAR_RE = /(?<![\\$])\$(?!\$)(?!\s)([^$\n\\]|\\.)+?(?<!\s)\$(?!\$)/;
  const COMBINED_RE_SRC =
    '(\\$\\$[\\s\\S]+?\\$\\$' +
    '|\\\\\\[[\\s\\S]+?\\\\\\]' +
    '|\\\\\\([\\s\\S]+?\\\\\\)' +
    '|' + INLINE_DOLLAR_RE.source + ')';
  const COMBINED_RE = new RegExp(COMBINED_RE_SRC, 'g');

  function scanTextFormulas() {
    try {
      const walker = document.createTreeWalker(
        document.body, NodeFilter.SHOW_TEXT, null, false
      );
      const textNodes = [];
      let node;
      while (node = walker.nextNode()) {
        const text = node.textContent;
        if (!text || text.length < 3) continue;
        const par = node.parentElement;
        if (!par) continue;
        if (par.hasAttribute(PROCESSED)) continue;
        if (par.getAttribute('data-lcm-inline-formula')) continue;
        if (SKIP_TAGS[par.tagName]) continue;
        if (isInsideEditable(par)) continue;

        if (/\\\(.+?\\\)/.test(text) || /\\\[[\s\S]+?\\\]/.test(text) ||
          /\$\$[\s\S]+?\$\$/.test(text) || INLINE_DOLLAR_RE.test(text)) {
          textNodes.push(node);
        }
      }
      for (let i = textNodes.length - 1; i >= 0; i--) {
        wrapLatexInText(textNodes[i]);
      }
    } catch (e) { warn('scanTextFormulas failed', e); }
  }

  function wrapLatexInText(textNode) {
    try {
      const text = textNode.textContent;
      const parent = textNode.parentNode;
      if (!parent) return;

      let anc = parent;
      while (anc && anc !== document.body) {
        if (anc.hasAttribute(PROCESSED)) return;
        anc = anc.parentElement;
      }

      const re = new RegExp(COMBINED_RE_SRC, 'g');
      let match;
      let lastIndex = 0;
      const fragments = [];
      let hasMatch = false;

      while ((match = re.exec(text)) !== null) {
        const formula = match[0];

        if (formula.charAt(0) === '$' && formula.charAt(1) !== '$') {
          const inner = formula.slice(1, -1);
          if (!looksLikeTex(inner)) continue;
        }

        hasMatch = true;

        if (match.index > lastIndex) {
          fragments.push(document.createTextNode(text.slice(lastIndex, match.index)));
        }

        const span = document.createElement('span');
        span.textContent = formula;
        span.setAttribute('data-lcm-inline-formula', '1');

        let latex;
        if (/^\\\(/.test(formula)) {
          latex = '$' + formula.slice(2, -2).trim() + '$';
        } else if (/^\\\[/.test(formula)) {
          latex = '$$' + formula.slice(2, -2).trim() + '$$';
        } else {
          latex = formula;
        }

        attach(span, latex);
        fragments.push(span);
        lastIndex = match.index + match[0].length;
      }

      if (!hasMatch) return;

      if (lastIndex < text.length) {
        fragments.push(document.createTextNode(text.slice(lastIndex)));
      }

      const frag = document.createDocumentFragment();
      for (let fi = 0; fi < fragments.length; fi++) {
        frag.appendChild(fragments[fi]);
      }
      parent.replaceChild(frag, textNode);
    } catch (e) { warn('wrapLatexInText failed', e); }
  }

  // ─── DOM walk ──────────────────────────────────────────────────────────────

  const SELECTORS = [
    '.katex-display', '.katex',
    '.MathJax', '.MathJax_Display',
    '.MathJax_SVG', '.MathJax_SVG_Display',
    '.MathJax_CHTML', '.MathJax_MathML_Display',
    'span[id^="MathJax-Element"]',
    'mjx-container',
    'math-renderer',
    '[data-tex]', '[data-formula]', '[data-latex]', '[data-math]',
    '[data-expression]',
    '[data-lcm-tex]',
    'math',
    '.mwe-math-element', '.mwe-math-fallback-image-inline', '.mwe-math-fallback-image-display',
    '.equation', '.math-container', '.formula',
    '.math-tex', '.latex-formula',
    '.math-display', '.display-math', '.math.display',
    '.wDYxhc math', '.co8aDb math', '.IZ6rdc math',
    '.wDYxhc [data-mathml]', '.co8aDb [data-mathml]',
    '.wDYxhc mjx-container', '.co8aDb mjx-container',
  ];

  // Pre-join selectors for a single querySelectorAll call
  const COMBINED_SELECTOR = SELECTORS.join(',');

  function collectElements() {
    const seen = new Set();
    const results = [];
    const queue = [document];

    while (queue.length) {
      const root = queue.pop();
      let base;
      try { base = root.querySelectorAll ? root : null; } catch (_) { continue; }
      if (!base) continue;

      // Single querySelectorAll instead of N separate calls
      try {
        const els = base.querySelectorAll(COMBINED_SELECTOR);
        for (let ei = 0; ei < els.length; ei++) {
          const el = els[ei];
          if (!seen.has(el) && !el.hasAttribute(PROCESSED)) { seen.add(el); results.push(el); }
        }
      } catch (e) { warn('querySelectorAll failed', e); }

      // aria-label / role="img" spans
      try {
        const spans = base.querySelectorAll('span[aria-label], span[role="img"][aria-label]');
        for (let j = 0; j < spans.length; j++) {
          const sp = spans[j];
          if (seen.has(sp) || sp.hasAttribute(PROCESSED)) continue;
          const lbl = (sp.getAttribute('aria-label') || '').trim();
          if (looksLikeTex(lbl) || lbl.charAt(0) === '$') {
            seen.add(sp); results.push(sp);
          }
        }
      } catch (e) { warn('aria-label scan failed', e); }

      // Images with LaTeX-like alt text
      try {
        const imgs = base.querySelectorAll('img[alt]');
        for (let ii = 0; ii < imgs.length; ii++) {
          const im = imgs[ii];
          if (seen.has(im) || im.hasAttribute(PROCESSED)) continue;
          const alt = (im.getAttribute('alt') || '').trim();
          if (looksLikeTex(alt)) {
            seen.add(im); results.push(im);
          }
        }
      } catch (e) { warn('img scan failed', e); }

      // Shadow roots — only traverse elements with shadowRoot directly
      // instead of querySelectorAll('*')
      try {
        const candidates = base.querySelectorAll(
          'math-renderer, mjx-container, [data-tex], [data-formula], [data-latex]'
        );
        for (let k = 0; k < candidates.length; k++) {
          if (candidates[k].shadowRoot) queue.push(candidates[k].shadowRoot);
        }
      } catch (e) { warn('shadow root scan failed', e); }
    }
    return results;
  }

  // ─── Scan ──────────────────────────────────────────────────────────────────

  function scan() {
    try {
      updateStamped();

      const elements = collectElements();

      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        try {
          if (el.classList && el.classList.contains('katex') && el.parentElement &&
            el.parentElement.classList && el.parentElement.classList.contains('katex-display')) continue;

          let anc = el.parentElement, skip = false;
          while (anc && anc !== document.body) {
            if (anc.hasAttribute(PROCESSED)) { skip = true; break; }
            anc = anc.parentElement;
          }
          if (skip) continue;

          let src;
          if (el.classList && el.classList.contains('katex-display')) {
            const inner = el.querySelector('.katex');
            src = extract(inner || el);
          } else {
            src = extract(el);
          }

          if (src) attach(el, src);
        } catch (e) { warn('scan element failed', e); }
      }

      scanTextFormulas();
    } catch (e) { warn('scan failed', e); }
  }

  // ─── Boot ──────────────────────────────────────────────────────────────────

  setTimeout(scan, 1200);

  // MutationObserver with debounce
  let mutationTimer = null;
  try {
    const obs = new MutationObserver(() => {
      clearTimeout(mutationTimer);
      mutationTimer = setTimeout(scan, 600);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) { warn('MutationObserver setup failed', e); }

  // Low-frequency fallback for edge cases (MutationObserver misses)
  setInterval(scan, 15000);

})();
