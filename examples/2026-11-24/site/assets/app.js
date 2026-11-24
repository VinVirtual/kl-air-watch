// Progressive enhancements. The site works without this file; it adds the theme toggle,
// chart readouts on hover and how old the data is.
(function () {
  'use strict';

  // Theme toggle (remembered per browser; follows the system until pressed).
  var toggle = document.querySelector('[data-theme-toggle]');
  if (toggle) {
    toggle.hidden = false;
    var current = function () {
      var set = document.documentElement.getAttribute('data-theme');
      if (set) return set;
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    };
    var label = function () {
      toggle.setAttribute('aria-label', current() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    };
    label();
    toggle.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try {
        window.localStorage.setItem('airwatch-theme', next);
      } catch (e) {
        /* storage blocked: the choice lasts for this page only */
      }
      label();
    });
  }

  // Chart readouts: the column under the pointer, written into the caption line.
  Array.prototype.forEach.call(document.querySelectorAll('[data-chart]'), function (fig) {
    var out = fig.querySelector('[data-readout]');
    var svg = fig.querySelector('svg');
    var cursor = fig.querySelector('.cursor');
    if (!out || !svg) return;
    var idle = out.textContent;
    var active = null;
    var show = function (el) {
      if (active) active.classList.remove('on');
      active = el;
      if (!el) {
        out.textContent = idle;
        if (cursor) cursor.classList.remove('on');
        return;
      }
      el.classList.add('on');
      out.textContent = el.getAttribute('data-read');
      if (cursor && el.hasAttribute('data-x')) {
        var vb = svg.viewBox.baseVal;
        var x = parseFloat(el.getAttribute('data-x')) * vb.width;
        cursor.setAttribute('x1', x);
        cursor.setAttribute('x2', x);
        cursor.classList.add('on');
      }
    };
    svg.addEventListener('pointerover', function (e) {
      var t = e.target.closest ? e.target.closest('[data-read]') : null;
      if (t) show(t);
    });
    svg.addEventListener('pointerleave', function () {
      show(null);
    });
  });

  // How old the data is. GitHub can start scheduled runs late; say so when it matters.
  var fresh = document.querySelector('[data-generated]');
  var age = document.querySelector('[data-age]');
  if (fresh && age) {
    var built = Date.parse(fresh.getAttribute('data-generated'));
    var paint = function () {
      var hours = (Date.now() - built) / 3600000;
      if (!isFinite(hours) || hours < 0) return;
      var text = hours < 1 ? ' Updated less than an hour ago.' : ' Updated ' + Math.round(hours) + (Math.round(hours) === 1 ? ' hour ago.' : ' hours ago.');
      age.textContent = text;
      var stale = hours > 7;
      document.documentElement.classList.toggle('is-stale', stale);
      var note = document.querySelector('[data-stale]');
      if (note) {
        note.hidden = !stale;
        if (stale) note.textContent = 'These numbers are ' + Math.round(hours) + ' hours old: the scheduled update is late. Check APIMS for official readings.';
      }
    };
    paint();
    window.setInterval(paint, 60000);
  }
})();
