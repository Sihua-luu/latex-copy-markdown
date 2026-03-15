(function () {
  'use strict';

  if (!document.body || !document.documentElement) return;

  var PROCESSED = 'data-lcm-attached';

  // ─── Toast ─────────────────────────────────────────────────────────────────

  function showToast(x, y, text, ok) {
    try {
      if (!document.body) return;
      var old = document.getElementById('lcm-toast');
      if (old) old.remove();
      var t = document.createElement('div');
      t.id = 'lcm-toast';
      t.textContent = text;
      if (!ok) t.classList.add('lcm-toast-error');
      document.body.appendChild(t);
      requestAnimationFrame(function () {
        var left = x + window.scrollX + 14;
        var top = y + window.scrollY - t.offsetHeight - 10;
        if (left + t.offsetWidth > window.scrollX + window.innerWidth - 8)
          left = x + window.scrollX - t.offsetWidth - 14;
        if (top < window.scrollY + 4) top = y + window.scrollY + 18;
        t.style.left = left + 'px';
        t.style.top = top + 'px';
        t.classList.add('lcm-toast-show');
      });
      setTimeout(function () {
        t.classList.remove('lcm-toast-show');
        setTimeout(function () { if (t.parentNode) t.remove(); }, 300);
      }, 1600);
    } catch (_) { }
  }

  // ─── Copy ──────────────────────────────────────────────────────────────────

  function copyText(text, mx, my) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { showToast(mx, my, 'Copied!', true); })
        .catch(function () { execCopy(text, mx, my); });
    } else {
      execCopy(text, mx, my);
    }
  }

  function execCopy(text, mx, my) {
    try {
      if (!document.body) return;
      var prevFocus = document.activeElement;
      var prevSel = window.getSelection();
      var savedRange = prevSel && prevSel.rangeCount > 0 ? prevSel.getRangeAt(0).cloneRange() : null;
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('style', 'position:fixed;top:-9999px;left:-9999px;opacity:0');
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      var ok = document.execCommand('copy');
      ta.remove();
      // Restore previous focus and selection
      if (prevFocus && prevFocus.focus) {
        try { prevFocus.focus(); } catch (_) { }
      }
      if (savedRange) {
        try {
          var sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(savedRange);
        } catch (_) { }
      }
      showToast(mx, my, ok ? 'Copied!' : 'Failed', ok);
    } catch (_) {
      showToast(mx, my, 'Failed', false);
    }
  }

  // ─── MathML → LaTeX reconstruction ────────────────────────────────────────

  var MO_MAP = {
    '\u2200': '\\forall', '\u2203': '\\exists', '\u2205': '\\emptyset',
    '\u2208': '\\in', '\u2209': '\\notin', '\u220B': '\\ni',
    '\u2211': '\\sum', '\u220F': '\\prod', '\u222B': '\\int',
    '\u222C': '\\iint', '\u222D': '\\iiint', '\u222E': '\\oint',
    '\u2218': '\\circ', '\u2219': '\\cdot', '\u00B7': '\\cdot',
    '\u00D7': '\\times', '\u00F7': '\\div',
    '\u2227': '\\land', '\u2228': '\\lor', '\u00AC': '\\neg', '\u2192': '\\to',
    '\u2190': '\\leftarrow', '\u21D2': '\\Rightarrow', '\u21D4': '\\Leftrightarrow',
    '\u2194': '\\leftrightarrow',
    '\u2264': '\\le', '\u2265': '\\ge', '\u2260': '\\ne',
    '\u226A': '\\ll', '\u226B': '\\gg',
    '\u2248': '\\approx', '\u2261': '\\equiv', '\u221D': '\\propto',
    '\u2282': '\\subset', '\u2283': '\\supset', '\u2286': '\\subseteq', '\u2287': '\\supseteq',
    '\u222A': '\\cup', '\u2229': '\\cap',
    '\u221E': '\\infty', '\u2202': '\\partial', '\u2207': '\\nabla',
    '\u221A': '\\sqrt', '\u2016': '\\|',
    '\u03B1': '\\alpha', '\u03B2': '\\beta', '\u03B3': '\\gamma', '\u03B4': '\\delta',
    '\u03B5': '\\epsilon', '\u03B6': '\\zeta', '\u03B7': '\\eta', '\u03B8': '\\theta',
    '\u03B9': '\\iota', '\u03BA': '\\kappa', '\u03BB': '\\lambda', '\u03BC': '\\mu',
    '\u03BD': '\\nu', '\u03BE': '\\xi', '\u03C0': '\\pi', '\u03C1': '\\rho',
    '\u03C3': '\\sigma', '\u03C4': '\\tau', '\u03C5': '\\upsilon', '\u03C6': '\\phi',
    '\u03C7': '\\chi', '\u03C8': '\\psi', '\u03C9': '\\omega',
    '\u0393': '\\Gamma', '\u0394': '\\Delta', '\u0398': '\\Theta', '\u039B': '\\Lambda',
    '\u039E': '\\Xi', '\u03A0': '\\Pi', '\u03A3': '\\Sigma', '\u03A6': '\\Phi',
    '\u03A8': '\\Psi', '\u03A9': '\\Omega',
    '\u2026': '\\ldots', '\u22EF': '\\cdots', '\u22EE': '\\vdots', '\u22F1': '\\ddots',
    '\u2032': "'", '\u2033': "''",
    '\u00B1': '\\pm', '\u2213': '\\mp',
    '\u2223': '\\mid', '\u2225': '\\parallel', '\u22A5': '\\perp',
    '\u2220': '\\angle',
  };

  var FENCE_MAP = { '(': '(', ')': ')', '[': '[', ']': ']', '{': '\\{', '}': '\\}', '|': '|', '\u2016': '\\|', '\u2329': '\\langle', '\u232A': '\\rangle', '\u27E8': '\\langle', '\u27E9': '\\rangle' };

  function mathml2latex(node) {
    if (!node) return '';
    if (node.nodeType === 3) return node.textContent.trim();
    if (node.nodeType !== 1) return '';

    var tag = node.tagName.toLowerCase().replace(/^m:/, '');
    var children = [];
    for (var c = node.firstChild; c; c = c.nextSibling) children.push(c);

    function kids() { return children.map(mathml2latex).join(''); }
    function kid(i) { return i < children.length ? mathml2latex(children[i]) : ''; }
    function brace(i) { var k = kid(i); return k.length > 1 ? '{' + k + '}' : k; }

    switch (tag) {
      case 'math': case 'mrow': case 'mstyle': case 'mpadded': case 'merror': case 'semantics':
        return kids();
      case 'mi': case 'mn':
        var txt = node.textContent.trim();
        return MO_MAP[txt] || txt;
      case 'mo':
        var op = node.textContent.trim();
        return MO_MAP[op] || op;
      case 'mtext':
        var mt = node.textContent.trim();
        return mt ? '\\text{' + mt + '}' : '';
      case 'mspace':
        return '\\;';
      case 'mfrac':
        return '\\frac' + brace(0) + brace(1);
      case 'msup':
        return kid(0) + '^' + brace(1);
      case 'msub':
        return kid(0) + '_' + brace(1);
      case 'msubsup':
        return kid(0) + '_' + brace(1) + '^' + brace(2);
      case 'munder':
        return kid(0) + '_{' + kid(1) + '}';
      case 'mover':
        var base = kid(0), over = kid(1);
        if (over === '\u0302' || over === '^') return '\\hat{' + base + '}';
        if (over === '\u0303' || over === '~') return '\\tilde{' + base + '}';
        if (over === '\u0304' || over === '\u00AF' || over === '-') return '\\overline{' + base + '}';
        if (over === '\u20D7' || over === '\u2192') return '\\vec{' + base + '}';
        if (over === '.') return '\\dot{' + base + '}';
        if (over === '..') return '\\ddot{' + base + '}';
        return base + '^{' + over + '}';
      case 'munderover':
        return kid(0) + '_{' + kid(1) + '}^{' + kid(2) + '}';
      case 'msqrt':
        return '\\sqrt{' + kids() + '}';
      case 'mroot':
        return '\\sqrt[' + kid(1) + ']{' + kid(0) + '}';
      case 'mfenced':
        var open = node.getAttribute('open') || '(';
        var close = node.getAttribute('close') || ')';
        var sep = node.getAttribute('separators') || ',';
        var lo = FENCE_MAP[open] || open;
        var lc = FENCE_MAP[close] || close;
        var parts = children.map(mathml2latex);
        return '\\left' + lo + parts.join(sep.charAt(0) + ' ') + '\\right' + lc;
      case 'mtable':
        var rows = [];
        for (var ri = 0; ri < children.length; ri++) {
          if (children[ri].nodeType === 1) {
            var cells = [];
            for (var ci = children[ri].firstChild; ci; ci = ci.nextSibling) {
              if (ci.nodeType === 1) cells.push(mathml2latex(ci));
            }
            rows.push(cells.join(' & '));
          }
        }
        return '\\begin{matrix}' + rows.join(' \\\\ ') + '\\end{matrix}';
      case 'mtr':
        var tds = [];
        for (var ti = 0; ti < children.length; ti++) {
          if (children[ti].nodeType === 1) tds.push(mathml2latex(children[ti]));
        }
        return tds.join(' & ');
      case 'mtd':
        return kids();
      case 'mphantom':
        return '\\phantom{' + kids() + '}';
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
    var t = raw.trim();
    if (!t) return null;
    // Already wrapped with $$...$$ — keep as display
    if (/^\$\$[\s\S]+\$\$$/.test(t)) return t;
    // Wrapped with \[...\] — convert to $$...$$
    if (/^\\\[[\s\S]+\\\]$/.test(t)) return '$$' + t.slice(2, -2).trim() + '$$';
    // Wrapped with $...$ (not $$) — upgrade to $$ if display mode
    if (/^\$(?!\$)[\s\S]+(?<!\$)\$$/.test(t)) {
      if (display) return '$' + t + '$'; // $..$ → $$..$$
      return t;
    }
    // Wrapped with \(...\) — convert to $...$ or $$...$$
    if (/^\\\([\s\S]+\\\)$/.test(t)) {
      var inner = t.slice(2, -2).trim();
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

      var dc = ['katex-display', 'MathJax_Display', 'MathJax_SVG_Display', 'math-display', 'display-math'];
      for (var i = 0; i < dc.length; i++) {
        if (el.classList && el.classList.contains(dc[i])) return true;
        if (el.parentElement && el.parentElement.classList && el.parentElement.classList.contains(dc[i])) return true;
      }

      // Walk up ancestors checking for display indicators
      try {
        var cur = el;
        for (var d = 0; d < 5 && cur && cur !== document.body; d++) {
          var cls = cur.className;
          if (typeof cls === 'string' && /\bdisplay\b/i.test(cls)) return true;
          if (cur.tagName && cur.tagName.toLowerCase() === 'mjx-container' &&
              cur.getAttribute('display') === 'true') return true;
          cur = cur.parentElement;
        }
      } catch (_) { }

      // closest() with expanded selectors
      try {
        if (el.closest && el.closest(
          '.katex-display,.MathJax_Display,.MathJax_SVG_Display,' +
          'mjx-container[display="true"],.math-display,.display-math'
        )) return true;
      } catch (_) { }

      // Heuristic: math element is the sole significant content of a block-level parent
      try {
        var parent = el.parentElement;
        if (parent) {
          var ptag = parent.tagName;
          if (ptag === 'P' || ptag === 'DIV' || ptag === 'SECTION' ||
              ptag === 'BLOCKQUOTE' || ptag === 'CENTER') {
            var siblings = parent.childNodes;
            var significantCount = 0;
            for (var si = 0; si < siblings.length; si++) {
              var sib = siblings[si];
              if (sib === el) { significantCount++; continue; }
              if (sib.nodeType === 3 && !sib.textContent.trim()) continue;
              significantCount++;
            }
            if (significantCount <= 1) return true;
          }
        }
      } catch (_) { }

    } catch (_) { }
    return false;
  }

  // Walk up to 5 ancestors looking for data attributes containing TeX
  var TEX_ATTRS = ['data-tex', 'data-formula', 'data-latex', 'data-katex', 'data-math',
    'data-expression', 'data-content', 'data-src', 'data-mathml'];

  function findTexInAncestors(el, maxDepth) {
    var cur = el;
    for (var d = 0; d < (maxDepth || 5) && cur && cur !== document.body; d++) {
      for (var i = 0; i < TEX_ATTRS.length; i++) {
        var v = cur.getAttribute(TEX_ATTRS[i]);
        if (v && looksLikeTex(v)) return v.trim();
      }
      cur = cur.parentElement;
    }
    return null;
  }

  function findAnnotation(root) {
    try {
      var a = root.querySelector('annotation[encoding="application/x-tex"]');
      return a ? a.textContent.trim() : null;
    } catch (_) { return null; }
  }

  // ─── Main extraction ──────────────────────────────────────────────────────

  function extract(el) {
    try {
      var disp = checkDisplay(el);
      var tex;

      // 1. data-lcm-tex stamp from page-script.js
      var stamped = el.getAttribute('data-lcm-tex');
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
      var elId = el.id || '';
      if (elId.indexOf('MathJax-Element') !== -1) {
        var scriptId = elId.replace('-Frame', '');
        var scriptEl = document.getElementById(scriptId);
        if (scriptEl && scriptEl.nodeName === 'SCRIPT') {
          tex = scriptEl.textContent.trim();
          if (tex) return wrapTex(tex, scriptEl.type && scriptEl.type.indexOf('mode=display') !== -1);
        }
      }

      // 6. MathJax v3 alttext
      tex = el.getAttribute('alttext');
      if (tex && tex.trim()) return wrapTex(tex.trim(), disp);

      // 7. aria-label
      var lbl = el.getAttribute('aria-label');
      if (lbl && looksLikeTex(lbl)) return lbl.trim().charAt(0) === '$' ? lbl.trim() : wrapTex(lbl.trim(), disp);

      // 8. title attribute
      var title = el.getAttribute('title');
      if (title && looksLikeTex(title)) return wrapTex(title.trim(), disp);

      // 9. Image alt text
      if (el.tagName === 'IMG') {
        var alt = el.getAttribute('alt');
        if (alt && looksLikeTex(alt)) return alt.trim().charAt(0) === '$' ? alt.trim() : wrapTex(alt.trim(), disp);
      }
      // Check for img inside container
      var img = el.querySelector && el.querySelector('img[alt]');
      if (img) {
        var imgAlt = img.getAttribute('alt');
        if (imgAlt && looksLikeTex(imgAlt)) return imgAlt.trim().charAt(0) === '$' ? imgAlt.trim() : wrapTex(imgAlt.trim(), disp);
      }

      // 10. MathML reconstruction — <math> element
      var mathEl = null;
      if (el.tagName === 'math' || el.tagName === 'MATH') {
        mathEl = el;
      } else {
        mathEl = el.querySelector && el.querySelector('math');
      }
      if (!mathEl && el.shadowRoot) {
        mathEl = el.shadowRoot.querySelector('math');
      }
      if (mathEl) {
        // First try annotation inside
        var ann = mathEl.querySelector('annotation[encoding="application/x-tex"]');
        if (ann && ann.textContent.trim()) return wrapTex(ann.textContent.trim(), disp);
        // Then try alttext on math element
        var mathAlt = mathEl.getAttribute('alttext');
        if (mathAlt && mathAlt.trim()) return wrapTex(mathAlt.trim(), disp);
        // Reconstruct from MathML structure
        tex = mathml2latex(mathEl);
        if (tex && tex.trim().length > 0) return wrapTex(tex.trim(), disp || mathEl.getAttribute('display') === 'block');
      }

      // 11. SVG data attributes
      var svg = null;
      if (el.tagName === 'svg' || el.tagName === 'SVG') {
        svg = el;
      } else {
        svg = el.querySelector && el.querySelector('svg');
      }
      if (svg) {
        for (var si = 0; si < TEX_ATTRS.length; si++) {
          tex = svg.getAttribute(TEX_ATTRS[si]);
          if (tex && looksLikeTex(tex)) return wrapTex(tex.trim(), disp);
        }
        var svgTitle = svg.querySelector('title');
        if (svgTitle && looksLikeTex(svgTitle.textContent)) return wrapTex(svgTitle.textContent.trim(), disp);
      }

      // 12. Adjacent JSON script
      try {
        var nextSib = el.nextElementSibling;
        if (nextSib && nextSib.nodeName === 'SCRIPT' &&
          (nextSib.type === 'application/json' || nextSib.type === 'text/json' || nextSib.type === 'math/json')) {
          var json = JSON.parse(nextSib.textContent);
          tex = json.formula || json.latex || json.tex || json.math || json.content;
          if (tex && looksLikeTex(tex)) return wrapTex(tex.trim(), disp);
        }
      } catch (_) { }

      // 13. Parent aria-label / title
      var par = el.parentElement;
      if (par) {
        var parLabel = par.getAttribute('aria-label');
        if (parLabel && looksLikeTex(parLabel)) return parLabel.trim().charAt(0) === '$' ? parLabel.trim() : wrapTex(parLabel.trim(), disp);
        var parTitle = par.getAttribute('title');
        if (parTitle && looksLikeTex(parTitle)) return wrapTex(parTitle.trim(), disp);
      }

    } catch (_) { }
    return null;
  }

  // ─── Attach ────────────────────────────────────────────────────────────────

  function attach(el, src) {
    if (!src || el.hasAttribute(PROCESSED)) return;
    if (isInsideEditable(el)) return;
    el.setAttribute(PROCESSED, '1');
    el.setAttribute('data-lcm-source', src);

    el.style.cursor = 'pointer';
    el.style.borderRadius = '3px';
    el.style.transition = 'background-color 0.15s, outline 0.15s';

    el.addEventListener('mouseenter', function () {
      el.style.backgroundColor = 'rgba(99,102,241,0.12)';
      el.style.outline = '1.5px dashed rgba(99,102,241,0.5)';
      el.style.outlineOffset = '3px';
    });
    el.addEventListener('mouseleave', function () {
      el.style.backgroundColor = '';
      el.style.outline = '';
      el.style.outlineOffset = '';
    });
    el.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      el.style.backgroundColor = 'rgba(99,102,241,0.25)';
      setTimeout(function () { el.style.backgroundColor = ''; }, 200);
      copyText(el.getAttribute('data-lcm-source'), e.clientX, e.clientY);
    });
  }

  function updateStamped() {
    try {
      var attached = document.querySelectorAll('[' + PROCESSED + ']');
      for (var i = 0; i < attached.length; i++) {
        var el = attached[i];
        var stamp = el.getAttribute('data-lcm-tex');
        if (!stamp) continue;
        var newSrc = wrapTex(stamp.trim(), el.getAttribute('data-lcm-display') === '1');
        var oldSrc = el.getAttribute('data-lcm-source');
        if (newSrc && newSrc !== oldSrc) el.setAttribute('data-lcm-source', newSrc);
      }
    } catch (_) { }
  }

  // ─── Text-based LaTeX scanner ─────────────────────────────────────────
  // Detects LaTeX formulas rendered as plain text (e.g. Google AI Overview)

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, NOSCRIPT: 1, CODE: 1, PRE: 1 };

  function isInsideEditable(el) {
    var cur = el;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      if (cur.isContentEditable) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  function scanTextFormulas() {
    try {
      var walker = document.createTreeWalker(
        document.body, NodeFilter.SHOW_TEXT, null, false
      );
      var textNodes = [];
      var node;
      while (node = walker.nextNode()) {
        var text = node.textContent;
        if (!text || text.length < 3) continue;
        var par = node.parentElement;
        if (!par) continue;
        if (par.hasAttribute(PROCESSED)) continue;
        if (par.getAttribute('data-lcm-inline-formula')) continue;
        if (SKIP_TAGS[par.tagName]) continue;
        if (isInsideEditable(par)) continue;

        // Check for LaTeX delimiter patterns
        if (/\\\(.+?\\\)/.test(text) || /\\\[[\s\S]+?\\\]/.test(text) ||
            /\$\$[\s\S]+?\$\$/.test(text) ||
            /(?<!\$)\$(?!\$)(?!\s)[^$\n]+?(?<!\s)\$(?!\$)/.test(text)) {
          textNodes.push(node);
        }
      }
      // Process in reverse to avoid invalidating references
      for (var i = textNodes.length - 1; i >= 0; i--) {
        wrapLatexInText(textNodes[i]);
      }
    } catch (_) { }
  }

  function wrapLatexInText(textNode) {
    try {
      var text = textNode.textContent;
      var parent = textNode.parentNode;
      if (!parent) return;

      // Skip if ancestor is already processed
      var anc = parent;
      while (anc && anc !== document.body) {
        if (anc.hasAttribute(PROCESSED)) return;
        anc = anc.parentElement;
      }

      // Combined regex: match $$...$$, \[...\], \(...\), $...$
      // Order matters: $$ before $
      var combinedRe = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\$)\$(?!\$)(?!\s)[^$\n]+?(?<!\s)\$(?!\$))/g;

      var match;
      var lastIndex = 0;
      var fragments = [];
      var hasMatch = false;

      while ((match = combinedRe.exec(text)) !== null) {
        var formula = match[0];

        // For single-$ matches, verify content looks like LaTeX to avoid currency false positives
        if (formula.charAt(0) === '$' && formula.charAt(1) !== '$') {
          var inner = formula.slice(1, -1);
          if (!looksLikeTex(inner)) continue;
        }

        hasMatch = true;

        if (match.index > lastIndex) {
          fragments.push(document.createTextNode(text.slice(lastIndex, match.index)));
        }

        var span = document.createElement('span');
        span.textContent = formula;
        span.setAttribute('data-lcm-inline-formula', '1');

        // Convert to markdown-style LaTeX for copying
        var latex;
        if (/^\\\(/.test(formula)) {
          latex = '$' + formula.slice(2, -2).trim() + '$';
        } else if (/^\\\[/.test(formula)) {
          latex = '$$' + formula.slice(2, -2).trim() + '$$';
        } else {
          latex = formula; // Already $...$ or $$...$$
        }

        attach(span, latex);
        fragments.push(span);
        lastIndex = match.index + match[0].length;
      }

      if (!hasMatch) return;

      if (lastIndex < text.length) {
        fragments.push(document.createTextNode(text.slice(lastIndex)));
      }

      var frag = document.createDocumentFragment();
      for (var fi = 0; fi < fragments.length; fi++) {
        frag.appendChild(fragments[fi]);
      }
      parent.replaceChild(frag, textNode);
    } catch (_) { }
  }

  // ─── DOM walk ──────────────────────────────────────────────────────────────

  var SELECTORS = [
    // KaTeX
    '.katex-display', '.katex',
    // MathJax v2 — all renderers
    '.MathJax', '.MathJax_Display',
    '.MathJax_SVG', '.MathJax_SVG_Display',
    '.MathJax_CHTML', '.MathJax_MathML_Display',
    'span[id^="MathJax-Element"]',
    // MathJax v3
    'mjx-container',
    // Gemini / custom
    'math-renderer',
    // data-* attributes
    '[data-tex]', '[data-formula]', '[data-latex]', '[data-math]',
    '[data-expression]',
    // Page-script stamps
    '[data-lcm-tex]',
    // MathML
    'math',
    // Wikipedia
    '.mwe-math-element', '.mwe-math-fallback-image-inline', '.mwe-math-fallback-image-display',
    // Generic math containers
    '.equation', '.math-container', '.formula',
    '.math-tex', '.latex-formula',
    // Display math patterns
    '.math-display', '.display-math', '.math.display',
    // Google AI Overview / SGE
    '.wDYxhc math', '.co8aDb math', '.IZ6rdc math',
    '.wDYxhc [data-mathml]', '.co8aDb [data-mathml]',
    '.wDYxhc mjx-container', '.co8aDb mjx-container',
  ];

  function collectElements() {
    var seen = new Set();
    var results = [];
    var queue = [document];

    while (queue.length) {
      var root = queue.pop();
      var base;
      try { base = root.querySelectorAll ? root : null; } catch (_) { continue; }
      if (!base) continue;

      for (var si = 0; si < SELECTORS.length; si++) {
        try {
          var els = base.querySelectorAll(SELECTORS[si]);
          for (var ei = 0; ei < els.length; ei++) {
            var el = els[ei];
            if (!seen.has(el) && !el.hasAttribute(PROCESSED)) { seen.add(el); results.push(el); }
          }
        } catch (_) { }
      }

      // aria-label / role="img" spans
      try {
        var spans = base.querySelectorAll('span[aria-label], span[role="img"][aria-label]');
        for (var j = 0; j < spans.length; j++) {
          var sp = spans[j];
          if (seen.has(sp) || sp.hasAttribute(PROCESSED)) continue;
          var lbl = (sp.getAttribute('aria-label') || '').trim();
          if (looksLikeTex(lbl) || lbl.charAt(0) === '$') {
            seen.add(sp); results.push(sp);
          }
        }
      } catch (_) { }

      // Images with LaTeX-like alt text
      try {
        var imgs = base.querySelectorAll('img[alt]');
        for (var ii = 0; ii < imgs.length; ii++) {
          var im = imgs[ii];
          if (seen.has(im) || im.hasAttribute(PROCESSED)) continue;
          var alt = (im.getAttribute('alt') || '').trim();
          if (looksLikeTex(alt)) {
            seen.add(im); results.push(im);
          }
        }
      } catch (_) { }

      // Shadow roots
      try {
        var all = base.querySelectorAll('*');
        if (all.length < 10000) {
          for (var k = 0; k < all.length; k++) {
            if (all[k].shadowRoot) queue.push(all[k].shadowRoot);
          }
        }
      } catch (_) { }
    }
    return results;
  }

  // ─── Scan ──────────────────────────────────────────────────────────────────

  function scan() {
    try {
      updateStamped();

      var elements = collectElements();

      for (var i = 0; i < elements.length; i++) {
        var el = elements[i];
        try {
          // Skip inner .katex inside .katex-display
          if (el.classList && el.classList.contains('katex') && el.parentElement &&
            el.parentElement.classList && el.parentElement.classList.contains('katex-display')) continue;

          // Skip if ancestor already attached
          var anc = el.parentElement, skip = false;
          while (anc && anc !== document.body) {
            if (anc.hasAttribute(PROCESSED)) { skip = true; break; }
            anc = anc.parentElement;
          }
          if (skip) continue;

          var src;
          if (el.classList && el.classList.contains('katex-display')) {
            var inner = el.querySelector('.katex');
            src = extract(inner || el);
          } else {
            src = extract(el);
          }

          if (src) attach(el, src);
        } catch (_) { }
      }

      // Scan for LaTeX formulas in plain text (Google AI Overview, etc.)
      scanTextFormulas();
    } catch (_) { }
  }

  // ─── Boot ──────────────────────────────────────────────────────────────────

  setTimeout(scan, 1200);

  var timer = null;
  try {
    var obs = new MutationObserver(function () { clearTimeout(timer); timer = setTimeout(scan, 600); });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) { }

  setInterval(scan, 2500);

})();
