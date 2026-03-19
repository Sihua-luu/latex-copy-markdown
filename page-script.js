(function () {
  'use strict';

  if (!document.body || !document.documentElement) return;

  const MATH_CLASSES = [
    'MathJax_SVG', 'MathJax_SVG_Display',
    'MathJax', 'MathJax_Display',
    'MathJax_CHTML', 'MathJax_MathML_Display'
  ];

  function isMathEl(el) {
    if (!el || !el.classList) return false;
    for (let i = 0; i < MATH_CLASSES.length; i++) {
      if (el.classList.contains(MATH_CLASSES[i])) return true;
    }
    return false;
  }

  function findRendered(scriptEl) {
    let next = scriptEl.nextElementSibling;
    let tries = 0;
    while (next && tries < 3) {
      if (isMathEl(next)) return next;
      try {
        const inner = next.querySelector('.MathJax_SVG,.MathJax,.MathJax_CHTML');
        if (inner) return next;
      } catch (_) { /* noop */ }
      next = next.nextElementSibling;
      tries++;
    }
    const parent = scriptEl.parentElement;
    if (parent && parent !== document.body) {
      next = parent.nextElementSibling;
      tries = 0;
      while (next && tries < 3) {
        if (isMathEl(next)) return next;
        next = next.nextElementSibling;
        tries++;
      }
    }
    return null;
  }

  function stamp() {
    try {
      if (!window.MathJax) return;

      // MathJax v2
      if (MathJax.Hub && MathJax.Hub.getAllJax) {
        const jaxList = MathJax.Hub.getAllJax();
        for (let i = 0; i < jaxList.length; i++) {
          const jax = jaxList[i];
          if (!jax.originalText) continue;
          const tex = jax.originalText;
          const inputEl = document.getElementById(jax.inputID);
          let display = false;
          try {
            display = (jax.root && jax.root.display === 'block') ||
              (inputEl && inputEl.type && inputEl.type.indexOf('mode=display') !== -1);
          } catch (_) { /* noop */ }

          const frameEl = document.getElementById(jax.inputID + '-Frame');
          const targets = [];
          if (frameEl) {
            targets.push(frameEl);
            const par = frameEl.parentElement;
            if (par && isMathEl(par)) targets.push(par);
          }
          if (targets.length === 0 && inputEl) {
            const rendered = findRendered(inputEl);
            if (rendered) targets.push(rendered);
          }

          for (let ti = 0; ti < targets.length; ti++) {
            if (!targets[ti].getAttribute('data-lcm-tex')) {
              targets[ti].setAttribute('data-lcm-tex', tex);
              targets[ti].setAttribute('data-lcm-display', display ? '1' : '0');
            }
          }
        }
      }

      // MathJax v3
      if (MathJax.startup && MathJax.startup.document) {
        try {
          const md = MathJax.startup.document;
          if (md.math && typeof md.math.forEach === 'function') {
            md.math.forEach(function (m) {
              if (m.math && m.typesetRoot && !m.typesetRoot.getAttribute('data-lcm-tex')) {
                m.typesetRoot.setAttribute('data-lcm-tex', m.math);
                m.typesetRoot.setAttribute('data-lcm-display', m.display ? '1' : '0');
              }
            });
          }
        } catch (_) { /* noop */ }
      }
    } catch (_) { /* noop */ }
  }

  // Run immediately
  stamp();

  // Hook MathJax v2 events
  try {
    if (window.MathJax && MathJax.Hub && MathJax.Hub.Register) {
      MathJax.Hub.Register.MessageHook('End Process', () => setTimeout(stamp, 100));
      MathJax.Hub.Register.MessageHook('End Reprocess', () => setTimeout(stamp, 100));
      MathJax.Hub.Register.MessageHook('New Math', () => setTimeout(stamp, 100));
    }
  } catch (_) { /* noop */ }

  // Hook MathJax v3
  try {
    if (window.MathJax && MathJax.startup && MathJax.startup.promise) {
      MathJax.startup.promise.then(() => setTimeout(stamp, 100));
    }
  } catch (_) { /* noop */ }

  // Low-frequency fallback (reduced from 2s to 15s — MathJax hooks handle the rest)
  setInterval(stamp, 15000);
})();
