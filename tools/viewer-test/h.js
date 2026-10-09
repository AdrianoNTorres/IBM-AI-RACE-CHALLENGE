// minimal CDP helper: opens a fresh tab on the viewer with GitHub raw fetches redirected to the local working tree
const fs = require('fs');
const PORT = 9333, BASE = 'http://127.0.0.1:8765/';
const INIT = function (prefs, base) {
  if (prefs) try { localStorage.setItem('rv_prefs', prefs); } catch (e) {}
  const f = window.fetch; window.__fetched = [];
  window.fetch = function (req, o) {
    let u = req && req.url ? req.url : String(req); window.__fetched.push(u);   /* a Request object (the 3D model loader passes one) or an address */
    const m = 'https://raw.githubusercontent.com/AdrianoNTorres/IBM-AI-RACE-CHALLENGE/';
    if (u.indexOf(m) !== 0) return f.call(this, req, o);
    const rest = u.slice(m.length); u = base + rest.slice(rest.indexOf('/') + 1);
    return f.call(this, u, o);
  };
};
async function open(hash, prefs, opts) {
  opts = opts || {};
  const ver = await (await fetch('http://127.0.0.1:' + PORT + '/json/version')).json();
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  let id = 0; const wait = new Map(), errors = [], logs = [];
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && wait.has(d.id)) { const w = wait.get(d.id); wait.delete(d.id); d.error ? w[1](new Error(JSON.stringify(d.error))) : w[0](d.result); return; }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception ? d.params.exceptionDetails.exception.description : d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'warning')) logs.push(d.params.type + ': ' + d.params.args.map(a => a.value || a.description).join(' '));
    if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') logs.push('log: ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
  };
  const send = (method, params, sessionId) => new Promise((res, rej) => { const k = ++id; wait.set(k, [res, rej]); ws.send(JSON.stringify({ id: k, method, params: params || {}, sessionId })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);
  await S('Runtime.enable'); await S('Page.enable'); await S('Log.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: opts.w || 1500, height: opts.h || 900, deviceScaleFactor: 1, mobile: false });
  const p = Object.assign({ tutorialDone: true, view: 'detailed', autoplay: false, theme: 'light' }, prefs || {});
  if (!opts.raw) await S('Page.addScriptToEvaluateOnNewDocument', { source: '(' + INIT.toString() + ')(' + (opts.keep ? 'null' : JSON.stringify(JSON.stringify(p))) + ',' + JSON.stringify(BASE) + ');' });
  await S('Page.navigate', { url: (opts.url || BASE + 'viewer/index.html') + (hash ? '#' + hash : '') });
  const ev = async (expr) => {
    const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text) + '\n in ' + expr.slice(0, 200));
    return r.result.value;
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const until = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 15000)) { try { if (await ev('!!(' + expr + ')')) return true; } catch (e) {} await sleep(100); } throw new Error('timeout: ' + expr); };
  const shot = async (name) => { const r = await S('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(__dirname + '/' + name + '.png', Buffer.from(r.data, 'base64')); };
  const key = async (k, code, vk) => { const b = { key: k, code: code || k, windowsVirtualKeyCode: vk || 0, nativeVirtualKeyCode: vk || 0 }; await S('Input.dispatchKeyEvent', Object.assign({ type: 'rawKeyDown' }, b)); await S('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, b)); };
  const mouse = (type, x, y, extra) => S('Input.dispatchMouseEvent', Object.assign({ type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }, extra || {}));
  const close = async () => { await send('Target.closeTarget', { targetId }); ws.close(); };
  return { ev, until, sleep, shot, key, mouse, S, errors, logs, close };
}
module.exports = { open };
