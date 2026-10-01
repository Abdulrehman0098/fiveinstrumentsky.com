/* ============================================================
   faq.js — accessible accordion for the FAQ section.
   Classic IIFE, no imports, no exports. Matches project style.

   Progressive enhancement: every .faq-answer ships with the
   `hidden` attribute, so if this file ever fails to load the page
   degrades to a clean list of questions rather than a flash of
   all answers. The app already requires JS to run at all.
   ============================================================ */

(function () {
  'use strict';

  var OPEN_CLASS = 'open';

  function init() {
    var items = document.querySelectorAll('.faq-item');
    if (!items.length) return;

    for (var i = 0; i < items.length; i++) {
      (function (item) {
        var btn = item.querySelector('.faq-question');
        var answer = item.querySelector('.faq-answer');
        if (!btn || !answer) return;

        // Reveal the element so it can be measured, then collapse it
        // again immediately. Transition timing lives in premium.css;
        // only max-height/opacity are driven from here.
        answer.removeAttribute('hidden');
        answer.style.overflow = 'hidden';
        answer.style.maxHeight = '0px';
        answer.style.opacity = '0';

        btn.addEventListener('click', function () {
          toggle(item, btn, answer);
        });

        // Arrow-key / Home / End navigation between questions.
        btn.addEventListener('keydown', function (e) {
          var buttons = Array.prototype.slice.call(
            document.querySelectorAll('.faq-question')
          );
          var idx = buttons.indexOf(btn);
          var target = null;

          if (e.key === 'ArrowDown') target = buttons[idx + 1];
          else if (e.key === 'ArrowUp') target = buttons[idx - 1];
          else if (e.key === 'Home') target = buttons[0];
          else if (e.key === 'End') target = buttons[buttons.length - 1];

          if (target) {
            e.preventDefault();
            target.focus();
          }
        });
      })(items[i]);
    }

    // Keep an open answer correctly sized when the viewport changes
    // (text reflows, so the measured scrollHeight is no longer valid).
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        var open = document.querySelectorAll('.faq-item.' + OPEN_CLASS + ' .faq-answer');
        for (var k = 0; k < open.length; k++) {
          open[k].style.maxHeight = open[k].scrollHeight + 'px';
        }
      }, 120);
    });
  }

  function toggle(item, btn, answer) {
    var isOpen = item.classList.contains(OPEN_CLASS);

    if (isOpen) {
      // Collapse: set an explicit height first so the transition has
      // a start value to animate away from.
      answer.style.maxHeight = answer.scrollHeight + 'px';
      // Force a reflow so the browser registers the start value.
      void answer.offsetHeight;
      item.classList.remove(OPEN_CLASS);
      answer.style.maxHeight = '0px';
      answer.style.opacity = '0';
      btn.setAttribute('aria-expanded', 'false');
    } else {
      item.classList.add(OPEN_CLASS);
      answer.style.maxHeight = answer.scrollHeight + 'px';
      answer.style.opacity = '1';
      btn.setAttribute('aria-expanded', 'true');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
