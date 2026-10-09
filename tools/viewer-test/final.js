// The final check (2026-10-08): one check for each thing it fixed, plus hostile input from outside.
// node final.js   (server and browser as in README.md; the browser needs --enable-unsafe-swiftshader for the 3D part)
const { open } = require('./h.js');
let bad = 0;
const ok = (name, pass, info) => { console.log((pass ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '   ' + JSON.stringify(info) : '')); if (!pass) bad++; };
const rect = id => `(() => { const e = document.getElementById('${id}'); if (!e || getComputedStyle(e).display === 'none') return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })()`;
const apart = (a, b) => !a || !b || a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1];
const noise = l => !/track\.xml|summary\.json/.test(l);
/* reopen the page with `source` run before the page's own scripts: it stands in for a hostile repository or stored setting */
const hostile = async (p, source) => { await p.S('Page.addScriptToEvaluateOnNewDocument', { source }); await p.S('Page.reload'); await p.sleep(300); };
/* answers of the source rewritten on the way in: rewrite(url, text) returns the new text or nothing */
const rewrite = fn => `(() => { const f = window.fetch; const rw = ${fn.toString()}; window.fetch = function (req, o) { const u = req && req.url ? req.url : String(req); return f.call(this, req, o).then(r => { if (!r.ok) return r; return r.clone().text().then(t => { const n = rw(u, t); return n === undefined ? r : new Response(n, { status: 200, headers: r.headers }); }); }); }; })();`;

(async () => {
  let p;

  /* ---------- 3D: each compared car has its own paint; the kart's cockpit camera is outside its driver ---------- */
  p = await open('tab=pm&pause&run=v1.31&cmp=v1.07&frame=1500', { view: 'detailed' });
  await p.until('RV.S.ds && RV.S.R && RV.S.CM.length === 1', 30000);
  await p.ev("RV.view3d.mode('3d')"); await p.until('RV.view3d.state().ready && RV.view3d.state().modelOn', 30000); await p.sleep(400);
  let s = await p.ev('RV.view3d.state()');
  ok('3D, two cars compared: each has a picture of its own to be painted on', s.cars === 2 && s.skins === 2, { cars: s.cars, skins: s.skins });
  await p.ev("RV.view3d.mode('adv'); RV.view3d.camera('rel'); RV.view3d.car('kart-oobi'); (() => { const e = document.getElementById('v3car'); e.value = 'kart-oobi'; e.onchange({ target: e }); })()");
  await p.until("RV.view3d.state().model === 'kart-oobi' && RV.view3d.state().modelOn", 20000);
  await p.ev("document.getElementById('v3cock').click()"); await p.sleep(600);
  s = await p.ev('RV.view3d.state()');
  const ahead = (s.eye[0] - s.car[0]) * s.fwd[0] + (s.eye[1] - s.car[1]) * s.fwd[1] + (s.eye[2] - s.car[2]) * s.fwd[2];
  ok('Kart, Cockpit: the camera is ahead of the driver, not inside the head', ahead > 0.3, +ahead.toFixed(2));
  await p.shot('final-kart-cockpit');
  ok('3D: no script error', p.errors.length === 0, p.errors);
  await p.close();

  /* ---------- narrow windows: nothing covers the readout or the keys, no page scrolls sideways ---------- */
  p = await open('tab=pm&pause&run=v1.31&frame=1500', { view: 'basic' }, { w: 1024, h: 768 });
  await p.until('RV.S.ds && RV.S.R', 30000); await p.sleep(400);
  let bar = await p.ev(rect('v3bar')), hud = await p.ev(rect('hud')), leg = await p.ev(rect('leg'));
  ok('1024 px, 2D: the 2D | 3D switch covers neither the readout nor the colour keys', !!bar && apart(bar, hud) && apart(bar, leg), { bar, hud, leg });
  await p.shot('final-1024');
  await p.close();
  for (const view of ['basic', 'detailed']) {
    p = await open('tab=pm&pause&run=v1.31&frame=1500', { view }, { w: 390, h: 844 });
    await p.until('RV.S.ds && RV.S.R', 30000); await p.sleep(400);
    bar = await p.ev(rect('v3bar')); hud = await p.ev(rect('hud'));
    ok('390 px, ' + view + ': the switch does not cover the readout', !!bar && !!hud && apart(bar, hud), { bar, hud });
    if (view === 'basic') await p.shot('final-390-track');
    const wide = [];
    for (const t of ['general', 'replay', 'data', 'custom', 'controls']) {
      await p.ev(`RV.S.setTab = '${t}'; RV.showTab('ps'); RV.settings.render(); 1`); await p.sleep(250);
      const over = await p.ev('document.documentElement.scrollWidth - innerWidth');
      if (over > 0) wide.push(t + ' +' + over);
      if (view === 'basic' && t === 'controls') await p.shot('final-390-controls');
    }
    await p.ev("RV.showTab('pt'); 1"); await p.sleep(500);
    const over = await p.ev('document.documentElement.scrollWidth - innerWidth'); if (over > 0) wide.push('telemetry +' + over);
    ok('390 px, ' + view + ': Settings (five tabs) and Telemetry do not scroll sideways', wide.length === 0, wide);
    await p.close();
  }

  /* ---------- options after # that are not what the page expects ---------- */
  p = await open('run=%&tab=pv', {});
  let up = true; try { await p.until('RV.S.ds && RV.S.R', 20000); } catch (e) { up = false; }
  ok('#run=% : the page starts all the same', up && p.errors.length === 0, p.errors);
  await p.close();
  p = await open('tab=pm&frame=x', {});
  await p.until('RV.S.ds && RV.S.R', 30000); await p.sleep(600);
  ok('#frame=x : the replay stands on a real step and nothing throws', (await p.ev('Number.isInteger(RV.S.i)')) && p.errors.length === 0, [await p.ev('String(RV.S.i)'), p.errors.slice(0, 1)]);
  await p.close();
  p = await open('tab=zzz', {});
  await p.until('RV.S.ds && RV.S.R', 30000); await p.sleep(400);
  ok('#tab=zzz : a page is shown', await p.ev("!!document.querySelector('.page.on') && !!document.querySelector('.tab.on')"), await p.ev('RV.S.tab'));
  await p.close();
  p = await open('tab=pm&pause&zoom=abc', {});
  await p.until('RV.S.ds && RV.S.R', 30000); await p.sleep(600);
  const at = await p.ev('RV.map.screenOf(0, 0)');
  ok('#zoom=abc : the map is still drawn to scale', !!at && typeof at[0] === 'number' && isFinite(at[0]) && isFinite(at[1]) && p.errors.length === 0, at);
  await p.close();

  /* ---------- a changelog that carries markup: shown as text, never run ---------- */
  p = await open('tab=pv', { view: 'detailed' });
  await p.until('RV.S.ds', 30000);
  await hostile(p, rewrite(function (u, t) {
    if (!/CHANGELOG(-simple)?\.md/.test(u)) return undefined;
    const evil = ' <img src=x onerror="window.__xss=1"><script>window.__xss=2</script><svg onload=window.__xss=3> \' " `';
    return t.replace(/^## v1\.31 — .*$/m, m => m + evil).replace(/(## v1\.31[\s\S]*?\| \*\*What changed\*\* \| )/, '$1' + evil + ' ').replace(/(## v1\.31[\s\S]*?\| \*\*Learned\*\* \| )/, '$1' + evil + ' ');
  }));
  await p.until('RV.S.ds && RV.S.R', 30000); await p.sleep(800);
  const shown = await p.ev("document.getElementById('pv').innerText.indexOf('<img src=x') >= 0");
  for (const t of ['pm', 'pt', 'pv']) { await p.ev(`RV.showTab('${t}'); 1`); await p.sleep(500); }
  await p.ev("RV.S.view = 'basic'; 1");
  ok('markup in a version’s title and text is shown as text and does not run', shown && (await p.ev('window.__xss')) === undefined && (await p.ev("document.querySelectorAll('#main img[src=x], #main script').length")) === 0, { shown, xss: await p.ev('String(window.__xss)') });
  await p.shot('final-hostile-title');
  await p.close();

  /* ---------- a recording with an impossible distance: refused, the page stays in use ---------- */
  p = await open('tab=pt&pause', { view: 'detailed' });
  await p.until('RV.S.ds', 30000);
  await hostile(p, rewrite(function (u, t) {
    if (!/runs\/run_.*\.csv/.test(u)) return undefined;
    const rows = t.trim().split('\n'), last = rows[rows.length - 1].split(',');
    last[3] = '1e13'; const inf = last.slice(); inf[3] = 'Infinity';
    return t.trim() + '\n' + last.join(',') + '\n' + inf.join(',') + '\n';
  }));
  let alive = true; try { await p.until('RV.S.ds', 20000); await p.sleep(2500); await p.ev("RV.showTab('pt'); 1"); await p.sleep(1500); await p.ev('1 + 1'); } catch (e) { alive = false; }
  ok('a recording that claims 1e13 m: the page still answers and says the recording cannot be used', alive && /no lap can have|cannot be read/.test(await p.ev('document.body.innerText')), alive ? (await p.ev("(document.getElementById('toast').innerText + ' | ' + document.getElementById('pe').innerText).slice(0, 160)")) : 'the page hangs');
  await p.shot('final-hostile-csv');
  await p.close();

  /* ---------- a track file that asks for a thousand million pieces: refused, the bundled map is used ---------- */
  p = await open('tab=pm&pause', {});
  await p.until('RV.S.ds', 30000);
  await hostile(p, `(() => { const f = window.fetch; window.fetch = function (req, o) { const u = req && req.url ? req.url : String(req);
    if (/\\/track\\.xml$/.test(u) && !/tracks\\//.test(u)) return f.call(this, 'tracks/corkscrew.xml').then(r => r.text()).then(t => new Response(t.replace(/(<attnum name="lg"[^>]*val=")[^"]+/, '$11e12').replace(/<attnum name="profil steps length"/, '<attnum name="profil steps" val="1e9"/><attnum name="profil steps length"'), { status: 200 }));
    return f.call(this, req, o); }; })();`);
  alive = true; try { await p.until('RV.S.ds && RV.S.R', 25000); } catch (e) { alive = false; }
  ok('a track file with an impossible segment: refused with a note, the bundled map is used', alive && (await p.ev('!!RV.S.ds.trk && !RV.S.ds.trkOwn && /no track can have/.test(RV.S.ds.trkNote)')), alive ? await p.ev('RV.S.ds.trkNote.slice(0, 140)') : 'the page hangs');
  await p.close();

  /* ---------- a stored theme whose "colour" is markup ---------- */
  const evilTheme = { id: 'x1', name: 'x', base: 'light"><img src=x onerror=window.__xss=4>', colors: { 'run-1': 'red"><img src=x onerror="window.__xss=5"><i x="', 'accent': '#ff0000', 'bad key"': '#000' } };
  p = await open('tab=pm&pause&run=v1.31&cmp=v1.07', { view: 'detailed', theme: 'custom:x1', themes: [evilTheme] });
  await p.until('RV.S.ds && RV.S.R && RV.S.CM.length === 1', 30000); await p.sleep(500);
  for (const t of ['pt', 'pv', 'pm']) { await p.ev(`RV.showTab('${t}'); 1`); await p.sleep(400); }
  await p.ev("RV.S.setTab = 'custom'; RV.showTab('ps'); RV.settings.render(); 1"); await p.sleep(400);
  ok('a stored theme with markup for a colour: only real colours are kept, nothing runs', (await p.ev('window.__xss')) === undefined && (await p.ev('JSON.stringify(RV.prefs.themes[0].colors)')) === '{"accent":"#ff0000"}' && (await p.ev('RV.prefs.themes[0].base')) === 'light', await p.ev('JSON.stringify(RV.prefs.themes[0])'));
  ok('RV.esc also escapes the single quote', (await p.ev("RV.esc(`a'b\"c<d`)")) === 'a&#39;b&quot;c&lt;d');
  ok('a repository link with .. in it is refused', (await p.ev("RV.data.parseGithubLink('good/repo/tree/../../evil/repo/main')")) === null && (await p.ev("!!RV.data.parseGithubLink('https://github.com/AdrianoNTorres/IBM-AI-RACE-CHALLENGE/tree/viewer_no_login')")));
  ok('Full telemetry, the 3D step: the planned speed is said to be tinted onto the road (there is no carpet any more)', await p.ev("fetch('js/tutorial.js').then(r => r.text()).then(t => t.indexOf('carpet') < 0 && t.indexOf('tinted onto the road') > 0)"));
  await p.close();

  console.log(bad ? bad + ' FAILED' : 'ALL PASSED');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL the script stopped: ' + e.message); process.exit(1); });
