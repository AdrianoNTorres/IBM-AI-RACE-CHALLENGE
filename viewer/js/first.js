/* Run viewer: what has to happen before the first paint. Loaded in the head, before the stylesheet.
   It is a file and not a script written into the page because the page's Content-Security-Policy allows
   scripts from the site's own files only: a script that got into the page any other way does not run. */
(function () {
  'use strict';
  /* theme before the first paint, so the page does not flash */
  var p = {}, c = null, root = document.documentElement;
  try { p = JSON.parse(localStorage.getItem('rv_prefs') || '{}') || {}; } catch (e) { /* storage blocked: defaults */ }
  var t = p.theme || 'system', m = /^custom:(.+)$/.exec(t);
  if (m && p.themes) for (var i = 0; i < p.themes.length; i++) if (p.themes[i] && p.themes[i].id === m[1]) c = p.themes[i];
  if (c) { t = c.base; for (var k in c.colors) root.style.setProperty('--' + k, c.colors[k]); }   /* a theme of the reader's own */
  if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.dataset.theme = t;
})();
