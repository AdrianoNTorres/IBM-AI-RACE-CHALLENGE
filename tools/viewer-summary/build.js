// Writes viewer/summary.json: for every version of docs/CHANGELOG.md that has a recording in runs/, its lap time,
// sector times, top speed, slowest corner and whether it has sensor columns. The run viewer reads this file when it
// opens (viewer/js/data.js, readSummary), so sector times are known without downloading every recording.
//
// It runs the viewer's own scripts (core.js, track.js, data.js), so the numbers are exactly the ones the page
// works out from a recording. Run by the publishing workflow (.github/workflows/pages.yml); by hand:
//   node tools/viewer-summary/build.js
// The file is not kept in Git (viewer/.gitignore): it is made again at every publication.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..', '..'), viewer = path.join(root, 'viewer');

for (const f of ['core.js', 'track.js', 'data.js']) vm.runInThisContext(fs.readFileSync(path.join(viewer, 'js', f), 'utf8'), { filename: f });
const RV = globalThis.RV;

const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const exists = p => fs.existsSync(path.join(root, p));
/* the branch being published: given by GitHub Actions; by hand, the branch of the working tree */
function branch() {
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
  try { const h = read('.git/HEAD').trim(); return h.indexOf('ref: refs/heads/') === 0 ? h.slice(16) : ''; } catch (e) { return ''; }
}
function repo() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const p = RV.data.parseGithubLink(RV.DEFAULT_LINK);
  return p ? p.owner + '/' + p.repo : '';
}

const full = RV.data.parseChangelog(read('docs/CHANGELOG.md'));
const files = new Map();
if (exists('runs')) for (const f of fs.readdirSync(path.join(root, 'runs'))) if (/\.csv$/i.test(f)) files.set(f, fs.statSync(path.join(root, 'runs', f)).size);
const versions = RV.data.buildVersions(full, null, files);
/* the track the page would use for this source: its own track.xml if it has one, else the bundled Corkscrew */
let trk = null, own = false;
if (exists('track.xml')) { try { trk = RV.track.parse(read('track.xml')); own = true; } catch (e) { trk = null; } }
if (!trk) trk = RV.track.parse(fs.readFileSync(path.join(viewer, 'tracks', 'corkscrew.xml'), 'utf8'));

const out = {}, r3 = x => (x == null ? null : +x.toFixed(3));
let n = 0, bad = 0;
for (const v of versions) {
  if (!v.file) continue;
  try {
    const run = RV.data.buildRun(read('runs/' + v.file), v.id, trk), s = run.sum;
    if (!run.sec) continue;                                   /* it does not fit the track: the page reads it itself */
    out[v.id] = { file: v.file, lap: r3(s.lap), sec: run.sec.map(r3), top: s.top, slow: s.slow, beams: !!run.beams, complete: !!s.complete };
    n++;
  } catch (e) { bad++; console.log('skipped ' + v.id + ' (' + v.file + '): ' + e.message); }
}
const summary = { made: new Date().toISOString(), source: { repo: repo(), branch: branch(), dir: '', sha: process.env.GITHUB_SHA || '' }, track: { own: own, total: +trk.total.toFixed(1) }, versions: out };
fs.writeFileSync(path.join(viewer, 'summary.json'), JSON.stringify(summary));
console.log('viewer/summary.json: ' + n + ' of ' + versions.length + ' versions' + (bad ? ', ' + bad + ' recordings could not be read' : '') + ', for ' + summary.source.repo + ' at ' + summary.source.branch);
