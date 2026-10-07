/* Run viewer: starts the page, unless it has been put inside another site's page. A page shown in someone
   else's frame can be covered with false buttons so that a click meant for them lands here (on Commit, say);
   a site of static files cannot forbid framing by a header, so the page refuses to run there instead. */
(function () {
  'use strict';
  var framed = true;
  try { framed = window.top !== window.self; } catch (e) { /* asking is refused only from inside a foreign frame */ }
  if (!framed) { globalThis.RV.boot(); return; }
  document.body.textContent = '';
  var box = document.createElement('div'), a = document.createElement('a');
  box.style.cssText = 'padding:24px;font:16px/1.5 system-ui,sans-serif';
  box.textContent = 'The run viewer does not run inside another page. ';
  a.href = location.href; a.target = '_top'; a.rel = 'noopener'; a.textContent = 'Open it on its own.';
  box.appendChild(a); document.body.appendChild(box);
})();
