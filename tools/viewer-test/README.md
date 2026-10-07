# Testing the run viewer in a real browser

The viewer (`viewer/`) has no build step and no unit tests. It is checked by driving the real page in a headless Edge (or Chrome) over the DevTools protocol, with Node and nothing to install.

## What is here

| File | What it does |
|---|---|
| `server.js` | Serves the repository root on `http://127.0.0.1:8765`, without caching. |
| `h.js` | `open(hash, prefs, opts)` opens the viewer in a fresh browser tab and returns helpers. |
| `smoke.js` | Opens every page and tab, runs a comparison, the tour and a phone-width window, and fails on any script error. |

`open()` redirects the page's requests to `raw.githubusercontent.com/AdrianoNTorres/IBM-AI-RACE-CHALLENGE/<branch>/...` to the local server, so the page reads the changelog and the runs **of your working tree**, not what is on GitHub.

## Running it (Windows, Git Bash)

```bash
cd tools/viewer-test
node server.js &                                   # 1. the files
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --remote-debugging-port=9333 \
  --user-data-dir="$(pwd -W)/.edge" --no-first-run --disable-gpu --window-size=1500,900 about:blank &   # 2. the browser
node smoke.js                                      # 3. the test
```

Stop both when you are done; the browser keeps running otherwise. In PowerShell:

```powershell
Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*remote-debugging-port=9333*') -or ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*server.js*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

`.edge/` (the browser's profile) is not for Git.

## Writing a check

```js
const { open } = require('./h.js');
(async () => {
  const p = await open('tab=pm&pause&run=v1.06&cmp=v1.05', { view: 'detailed' });   // the address options, the stored settings
  await p.until('RV.S.ds && RV.S.R && RV.S.CM.length === 1');                       // wait for a condition in the page
  console.log(await p.ev("document.getElementById('hud').innerText"));              // evaluate in the page
  await p.mouse('mousePressed', 400, 300); await p.mouse('mouseMoved', 500, 340); await p.mouse('mouseReleased', 500, 340);
  await p.key(' ', 'Space', 32);
  await p.shot('name');                                                             // name.png in this folder: look at it
  console.log(p.errors, p.logs);                                                    // script errors and console errors
  await p.close();
})();
```

- `open(hash, prefs, opts)`: `prefs` replaces the stored settings (`rv_prefs`); pass `null` with `opts.keep = true` to reopen the page **with what the last page stored** (for "is it still there after a reload"). `opts.w`, `opts.h`: the window.
- `p.ev(expr)` returns the value **by copy**. Never return a run or the data set (`RV.S.R`, `RV.S.ds`): they are large and refer to each other. Return numbers, strings and small arrays.
- The stored settings carry over between scripts unless `prefs` is given. To start clean: `await p.ev('localStorage.clear()')` and open again.
- A 404 for `track.xml` in the log is expected (the source has none; the bundled track is used).
- Useful hooks in the page: `RV.map.carsNow()`, `RV.map.screenOf(x, y)`, `RV.map.LAYERS`, `RV.map.PANELS`, `RV.analysis.of(run)`, `RV.play.go(i)`, `RV.play.set(bool)`, `RV.sel.set([...])` + `RV.sel.apply(fn)`, `RV.showTab(id)`.

## What it has taught

- Check what the user would see, not only that code ran: take a screenshot and read it. Twice a feature "worked" in a test and was invisible or mis-laid-out on screen.
- Test the page **as it opens** (newest version selected, nothing compared). A feature that needs a second version looks broken there.
- Pixel counts and exact pixel positions make brittle checks. Prefer the page's own state plus one screenshot.
