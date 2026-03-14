(function () {
  'use strict';

  if (!document.body || !document.documentElement) return;

  var MATH_CLASSES = [
    'MathJax_SVG', 'MathJax_SVG_Display',
    'MathJax', 'MathJax_Display',
    'MathJax_CHTML', 'MathJax_MathML_Display'
  ];

  function isMathEl(el) {
    if (!el || !el.classList) return false;
    for (var i = 0; i < MATH_CLASSES.length; i++) {
      if (el.classList.contains(MATH_CLASSES[i])) return true;
    }
    return false;
  }

  function findRendered(scriptEl) {
    // Walk forward from the script to find its rendered output
    var next = scriptEl.nextElementSibling;
    var tries = 0;
    while (next && tries < 3) {
      if (isMathEl(next)) return next;
      try {
        var inner = next.querySelector('.MathJax_SVG,.MathJax,.MathJax_CHTML');
        if (inner) return next;
      } catch (_) { }
      next = next.nextElementSibling;
      tries++;
    }
    // Script might be inside a wrapper — check wrapper's next siblings
    var parent = scriptEl.parentElement;
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
      var count = 0;

      // MathJax v2
      if (MathJax.Hub && MathJax.Hub.getAllJax) {
        var jaxList = MathJax.Hub.getAllJax();
        for (var i = 0; i < jaxList.length; i++) {
          var jax = jaxList[i];
          if (!jax.originalText) continue;
          var tex = jax.originalText;
          var inputEl = document.getElementById(jax.inputID);
          var display = false;
          try {
            display = (jax.root && jax.root.display === 'block') ||
              (inputEl && inputEl.type && inputEl.type.indexOf('mode=display') !== -1);
          } catch (_) { }

          var frameEl = document.getElementById(jax.inputID + '-Frame');
          var targets = [];
          if (frameEl) {
            targets.push(frameEl);
            var par = frameEl.parentElement;
            if (par && isMathEl(par)) targets.push(par);
          }
          if (targets.length === 0 && inputEl) {
            var rendered = findRendered(inputEl);
            if (rendered) targets.push(rendered);
          }

          for (var ti = 0; ti < targets.length; ti++) {
            if (!targets[ti].getAttribute('data-lcm-tex')) {
              targets[ti].setAttribute('data-lcm-tex', tex);
              targets[ti].setAttribute('data-lcm-display', display ? '1' : '0');
              count++;
            }
          }
        }
      }

      // MathJax v3
      if (MathJax.startup && MathJax.startup.document) {
        try {
          var md = MathJax.startup.document;
          if (md.math && typeof md.math.forEach === 'function') {
            md.math.forEach(function (m) {
              if (m.math && m.typesetRoot && !m.typesetRoot.getAttribute('data-lcm-tex')) {
                m.typesetRoot.setAttribute('data-lcm-tex', m.math);
                m.typesetRoot.setAttribute('data-lcm-display', m.display ? '1' : '0');
                count++;
              }
            });
          }
        } catch (_) { }
      }
    } catch (_) { }
  }

  // Run immediately
  stamp();

  // Hook MathJax v2 events
  try {
    if (window.MathJax && MathJax.Hub && MathJax.Hub.Register) {
      MathJax.Hub.Register.MessageHook('End Process', function () { setTimeout(stamp, 100); });
      MathJax.Hub.Register.MessageHook('End Reprocess', function () { setTimeout(stamp, 100); });
      MathJax.Hub.Register.MessageHook('New Math', function () { setTimeout(stamp, 100); });
    }
  } catch (_) { }

  // Hook MathJax v3
  try {
    if (window.MathJax && MathJax.startup && MathJax.startup.promise) {
      MathJax.startup.promise.then(function () { setTimeout(stamp, 100); });
    }
  } catch (_) { }

  // Periodic fallback
  setInterval(stamp, 2000);
})();
