'''Record a version once: changelog entry, batch row, ledger rows, run CSV, commit and tag.

    python tools/record.py %TEMP%\\v118\\version.md --dry-run     # print everything, change nothing
    python tools/record.py %TEMP%\\v118\\version.md               # do it (never pushes)

The agent writes one short file (with the Write tool, not a shell heredoc); every measured
number comes from tools/accept.py's files in the same folder (<label>.accept.json and
results.jsonl), so no number is typed by hand. version.md:

    # v1.18 - Title of the version
    decision: kept                 (kept | enabling | rejected)
    label: A                       (the accepted candidate's label; may be left out if the folder has one accept.json)
    ## What changed
    ## Why                         (the reasoning for the chosen mechanism; keep it short)
    ## Prediction
    ## Observed                    (optional: what the numbers below do not show)
    ## Decision                    (optional: one sentence; the bar's numbers are added)
    ## Learned
    ## Variables                   (old -> new, one per line)
    ## Alternatives                (one per line:  label | where | what was tried | why it lost)

An alternative's label is looked up in results.jsonl (its line with the most runs): runs,
paired difference, SE, runs off and worst |trackPos| are filled in from there. A label that
was never run is recorded as "not run".

What it does, in order: checks (branch main, tag and entry not there yet, bar passed for a kept
version); runs the driver on disk with harness/run_race.py and requires the CSV to be byte for
byte the accepted candidate's unperturbed run (else the driver on disk is not what was
accepted: nothing is written); appends the entry to docs/CHANGELOG.md in its usual table
format, a row to the first table of docs/batch.md and rows to docs/ledger.md; commits the
driver, the changelog, the ledger, the run CSV and changed files in tools/; creates the
annotated tag. A rejected version is committed and tagged the same way, then the driver is
restored from the previous commit and that is committed too. No attribution lines, no push.
'''
import argparse, filecmp, glob, json, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from finalize import screen_time

CHANGELOG = os.path.join(REPO, 'docs', 'CHANGELOG.md')
BATCH = os.path.join(REPO, 'docs', 'batch.md')
LEDGER = os.path.join(REPO, 'docs', 'ledger.md')
LEDGER_HEAD = ('# Findings ledger\n\nOne row per candidate that was measured (or considered and not run), newest version last. '
               'Written by `tools/record.py` from `tools/accept.py`\'s results; search it before trying an idea: '
               '`grep -i "plan_ff\\|1,931" docs/ledger.md`. Difference = paired mean lap difference to that version\'s base '
               '(s, negative = faster) over the stated runs; worst = largest on-track \\|trackPos\\| and where.\n\n'
               '| Version | Candidate | Where | What was tried | Runs | Difference | SE | Off | Worst | Verdict | Why / note |\n'
               '|---|---|---|---|---|---|---|---|---|---|---|\n')
SECTIONS = ['What changed', 'Why', 'Prediction', 'Observed', 'Decision', 'Learned', 'Variables', 'Alternatives']

def git(*args, check=True):
    r = subprocess.run(['git'] + list(args), cwd=REPO, capture_output=True, text=True, encoding='utf-8')
    if check and r.returncode: sys.exit('git %s failed: %s' % (' '.join(args), r.stderr.strip()))
    return r.stdout.strip()

def cell(s):
    '''One table cell: single line, pipes escaped.'''
    s = re.sub(r'\s*\n\s*', ' ', s.strip())
    return re.sub(r'(?<!\\)\|', r'\\|', s)

def parse_version(path):
    txt = open(path, encoding='utf-8').read().replace('\r\n', '\n')
    m = re.match(r'#\s*(v\d+\.\d+)\s*[-\u2014\u2013]\s*(.+)', txt)
    if not m: sys.exit('version.md must start with "# vX.Y - Title"')
    v = dict(version=m.group(1), title=m.group(2).strip())
    head = txt.split('\n## ', 1)[0]
    for k in ('decision', 'label'):
        mm = re.search(r'(?mi)^%s:\s*(\S+)' % k, head)
        v[k] = mm.group(1).lower() if (mm and k == 'decision') else (mm.group(1) if mm else None)
    if v['decision'] not in ('kept', 'enabling', 'rejected'): sys.exit('decision: must be kept, enabling or rejected')
    for name, body in re.findall(r'(?ms)^## ([^\n]+)\n(.*?)(?=^## |\Z)', txt):
        if name.strip() not in SECTIONS: sys.exit('unknown section "## %s" (allowed: %s)' % (name.strip(), ', '.join(SECTIONS)))
        v[name.strip()] = body.strip()
    for need in ('What changed', 'Why', 'Prediction', 'Learned', 'Variables'):
        if not v.get(need): sys.exit('version.md: section "## %s" is missing or empty' % need)
    v['alts'] = []
    for ln in (v.get('Alternatives') or '').split('\n'):
        ln = ln.strip().lstrip('-').strip()
        if not ln: continue
        f = [x.strip() for x in ln.split('|')]
        if len(f) != 4: sys.exit('Alternatives line needs "label | where | what | why": %r' % ln)
        v['alts'].append(dict(label=f[0], where=f[1], what=f[2], why=f[3]))
    return v

def num(x, fmt='%+.3f'): return 'n/a' if x is None else fmt % x
def thousands(x): return '{:,.0f}'.format(x)

def alt_numbers(a, results):
    r = results.get(a['label'])
    if not r: return dict(runs='not run', diff='', se='', off='', worst='')
    return dict(runs='%d (%s)' % (r['n'], r['mode']), diff=num(r.get('diff')), se=num(r.get('se'), '%.3f'), off='%d of %d' % (r['off'], r['n']),
                worst=('%.3f @ %s m' % (r['worst'], thousands(r['worst_at']))) if r.get('worst') is not None else 'none on track')

def build(v, acc, results, run_name, prev):
    p0, b0 = acc['p0'], acc.get('p0_base') or {}
    g = {x['group']: x for x in acc['groups']}; bg = {x['group']: x for x in acc['base_groups']}
    dot, colon = screen_time(p0['lap'])
    p30, p40, p70 = acc['pair30'], acc['pair40'], acc['pair70']
    pr = lambda p: '%s s (SE %s; %d / %d / %d)' % (num(p['mean']), num(p['se'], '%.3f'), p['faster'], p['slower'], p['same'])
    shifted = [x for x in acc['groups'] if x['group'] != 'base']
    checks = '; '.join('%s check %d of %d off, worst %s at %s m (`%s`)' % (c, k['off'], k['n'], num(k['worst'], '%.3f'),
                       thousands(k['worst_at']) if k['worst_at'] else 'n/a', k['worst_run']) for c, k in acc['checks'].items()) or 'no checks run'
    pats = acc.get('patterns') or {}
    pat = ''
    if 'base' in pats and 'cand' in pats:
        names = [('reversals', 'reversals'), ('episodes', 'episodes'), ('flips', 'target flips'), ('plan_jumps', 'plan jumps'), ('brake_apps', 'brake applications'),
                 ('short', 'short touches'), ('reapplied', 're-applied'), ('shifts', 'shifts'), ('undone', 'undone'), ('tc_s', 'TC s')]
        pat = ' Patterns (base \u2192 this): ' + ', '.join('%s %g \u2192 %g' % (n, pats['base'][k], pats['cand'][k]) for k, n in names) + '.'
    observed = ('Run `runs/%s`; TORCS time %.3f s \u2192 on screen %s (base %s); max \\|trackPos\\| %.3f at ~%s m; slowest corner %.0f km/h at ~%s m. '
                '**All-30 %.3f** (base %s), worst %.3f at %s m, %d of %d off; shifted %d of %d off: %s. '
                'Paired against the base: 30 runs %s, 40 shifted %s, **all 70 %s**; largest section differences: %s. Checks: %s.%s Races for this record: %d run, %d from the cache.'
                % (run_name, p0['lap'], colon, num(b0.get('lap'), '%.3f'), p0['max_tp'], thousands(p0['max_tp_at']), p0['min_corner'], thousands(p0['min_corner_at']),
                   g['base']['mean'], num(bg['base']['mean'], '%.3f'), g['base']['worst'], thousands(g['base']['worst_at']), g['base']['off'], g['base']['n'],
                   sum(x['off'] for x in shifted), sum(x['n'] for x in shifted),
                   ', '.join('%s %.3f worst %.3f' % (x['group'], x['mean'], x['worst']) for x in shifted if x['mean'] is not None),
                   pr(p30), pr(p40), pr(p70), ', '.join('%s m %+.3f' % (thousands(k), d) for k, d in p70['sections']) or 'none', checks, pat,
                   acc.get('raced', 0), acc.get('cached', 0)))
    if v.get('Observed'): observed += ' ' + v['Observed']
    bar = '; '.join('%s: %s' % (b['item'], b['detail']) for b in acc['bar'])
    mark = {'kept': '\u2705 Kept \u2014 ', 'enabling': '\u2705 Kept \u2014 enabling change: ', 'rejected': '\u274c Rejected \u2014 '}[v['decision']]
    decision = mark + (v.get('Decision', '') + ' ' if v.get('Decision') else '') + 'Bar: ' + bar + '.' + (' Driver restored to the previous commit.' if v['decision'] == 'rejected' else '')
    why = v['Why']
    rows = []
    if v['alts']:
        parts = []
        for a in v['alts']:
            n = alt_numbers(a, results)
            parts.append('`%s` (%s) %s: %s \u2014 %s' % (a['label'], a['where'], a['what'],
                         'not run' if n['runs'] == 'not run' else '%s runs %s s (SE %s), %s off, worst %s' % (n['runs'], n['diff'], n['se'], n['off'], n['worst']), a['why']))
            rows.append('| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |' % (v['version'], cell(a['label']), cell(a['where']), cell(a['what']), n['runs'], n['diff'], n['se'], n['off'], cell(n['worst']),
                        'not run' if n['runs'] == 'not run' else 'lost', cell(a['why'])))
        why += ' **Alternatives (numbers from the screens, paired against the base):** ' + '; '.join(parts) + '.'
    rows.insert(0, '| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |' % (v['version'], '**chosen**', 'see title', cell(v['title']), '70 (full)', num(p70['mean']), num(p70['se'], '%.3f'),
                '%d of 70' % sum(x['off'] for x in acc['groups']), '%.3f @ %s m' % (max(x['worst'] for x in acc['groups'] if x['worst'] is not None), thousands(max(acc['groups'], key=lambda x: x['worst'] or 0)['worst_at'])),
                {'kept': 'kept', 'enabling': 'kept (enabling)', 'rejected': 'rejected'}[v['decision']], cell(v.get('Decision') or '')))
    f = lambda k: cell(v[k])
    entry = ('## %s \u2014 %s\n\n| Field | Detail |\n|---|---|\n| **Version** | %s |\n| **What changed** | %s |\n| **Why** | %s |\n| **Prediction** | %s |\n'
             '| **Lap time** | %s |\n| **Damage** | %d |\n| **Top speed** | %d km/h |\n| **Min speed** | %.0f km/h |\n| **Observed** | %s |\n| **Decision** | %s |\n| **Learned** | %s |\n'
             % (v['version'], v['title'], v['version'], f('What changed') + ' Variables: ' + cell('; '.join(x.strip().lstrip('-').strip() for x in v['Variables'].split('\n') if x.strip())) + '.',
                cell(why), f('Prediction'), dot, p0['damage'], p0['top'], p0['min_corner'], cell(observed), cell(decision), f('Learned')))
    worst = max(x['worst'] for x in acc['groups'] if x['worst'] is not None)
    batch_row = ('| %s %s | %s / %.3f (base %s; all-30 %.3f vs %s, %d of 30 off; shifted %d of %d off; paired over 70 runs %s s, SE %s; %s) | %d | %d | %.3f on the lap, %.3f worst of the 70 | **%s.** %s | %s |'
                 % (v['version'], '\u274c' if v['decision'] == 'rejected' else '\u2705', colon, p0['lap'], num(b0.get('lap'), '%.3f'), g['base']['mean'], num(bg['base']['mean'], '%.3f'), g['base']['off'],
                    sum(x['off'] for x in shifted), sum(x['n'] for x in shifted), num(p70['mean']), num(p70['se'], '%.3f'),
                    ', '.join('%s %d of %d off' % (c, k['off'], k['n']) for c, k in acc['checks'].items()), p0['top'], p0['damage'], p0['max_tp'], worst,
                    cell(v['title']), cell(v['What changed'])[:600], cell('; '.join(x.strip().lstrip('-').strip() for x in v['Variables'].split('\n') if x.strip()))))
    msg = ('%s: %s. %s (TORCS %.3f), %d damage; all-30 %.3f (base %s), %d of 30 off, shifted %d of %d off, %s; paired over 70 runs %s s (SE %s). %s'
           % (v['version'], v['title'], dot, p0['lap'], p0['damage'], g['base']['mean'], num(bg['base']['mean'], '%.3f'), g['base']['off'],
              sum(x['off'] for x in shifted), sum(x['n'] for x in shifted), ', '.join('%s check %d of %d off' % (c, k['off'], k['n']) for c, k in acc['checks'].items()) or 'no checks',
              num(p70['mean']), num(p70['se'], '%.3f'), 'Rejected, driver restored' if v['decision'] == 'rejected' else 'Kept'))
    return entry, batch_row, rows, msg

def append_changelog(entry, version):
    s = open(CHANGELOG, encoding='utf-8', newline='').read()
    nl = '\r\n' if '\r\n' in s else '\n'
    m = re.search(r'(\r?\n)---\r?\n\r?\n\*Last updated[^\n]*\r?\n?\s*$', s)
    if not m: sys.exit('CHANGELOG.md: footer "--- / *Last updated ...*" not found at the end')
    s = s[:m.start()].rstrip() + nl + nl + entry.replace('\n', nl) + nl + '---' + nl + nl + '*Last updated after %s run.*' % version + nl
    open(CHANGELOG, 'w', encoding='utf-8', newline='').write(s)

def append_batch(row):
    if not os.path.exists(BATCH): return False
    s = open(BATCH, encoding='utf-8', newline='').read()
    nl = '\r\n' if '\r\n' in s else '\n'
    lines = s.split(nl)
    i = next((k for k, l in enumerate(lines) if l.startswith('|---')), None)
    if i is None: return False
    while i + 1 < len(lines) and lines[i + 1].startswith('|'): i += 1
    lines.insert(i + 1, row)
    open(BATCH, 'w', encoding='utf-8', newline='').write(nl.join(lines))
    return True

def append_ledger(rows):
    new = not os.path.exists(LEDGER)
    with open(LEDGER, 'a', encoding='utf-8', newline='\n') as f:
        if new: f.write(LEDGER_HEAD)
        f.write('\n'.join(rows) + '\n')

def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('version_md', help='the version file, in the work folder that holds accept.py\'s output')
    ap.add_argument('--dry-run', action='store_true', help='print the entry, the rows and the commit message; change nothing')
    a = ap.parse_args()
    out = os.path.dirname(os.path.abspath(a.version_md))
    v = parse_version(a.version_md)
    accs = glob.glob(os.path.join(out, '*.accept.json'))
    path = os.path.join(out, v['label'] + '.accept.json') if v['label'] else (accs[0] if len(accs) == 1 else None)
    if not path or not os.path.exists(path): sys.exit('no accept.json for the version: give "label:" in version.md (found: %s)' % [os.path.basename(x) for x in accs])
    acc = json.load(open(path)); label = acc['label']
    results = {}
    rj = os.path.join(out, 'results.jsonl')
    for ln in open(rj) if os.path.exists(rj) else []:
        r = json.loads(ln)
        if r['label'] not in results or r['n'] >= results[r['label']]['n']: results[r['label']] = r   # the largest run set, the latest of equals
    if v['decision'] == 'kept' and acc['verdict'] != 'PASS': sys.exit('the bar was not passed (%s): a kept version needs PASS; use decision: enabling or rejected' % path)
    if v['decision'] == 'enabling' and any(not b['ok'] for b in acc['bar'] if 'off' in b['item']): sys.exit('an enabling change still needs 0 off and 0 damage')
    if not a.dry_run:
        if git('branch', '--show-current') != 'main': sys.exit('not on branch main')
        if git('tag', '-l', v['version']): sys.exit('tag %s exists already' % v['version'])
        if re.search(r'(?m)^## %s ' % re.escape(v['version']), open(CHANGELOG, encoding='utf-8').read()): sys.exit('CHANGELOG.md already has %s' % v['version'])
        before = set(glob.glob(os.path.join(REPO, 'runs', '*.csv')))
        r = subprocess.run([sys.executable, os.path.join(REPO, 'harness', 'run_race.py')], cwd=REPO, capture_output=True, text=True)
        new = sorted(set(glob.glob(os.path.join(REPO, 'runs', '*.csv'))) - before)
        if not new: sys.exit('run_race.py wrote no CSV:\n' + (r.stdout + r.stderr)[-600:])
        run = new[-1]
        ref = os.path.join(out, label, 'base_s1_p0.csv')
        if not os.path.exists(ref) or not filecmp.cmp(run, ref, shallow=False):
            os.remove(run)
            sys.exit('the driver on disk is not the accepted candidate (its run differs from %s): nothing recorded. Put the accepted driver in place and run accept.py on it.' % ref)
    else:
        run = os.path.join(REPO, 'runs', 'run_<date>_<time>.csv')
    prev = git('describe', '--tags', '--abbrev=0', check=False)
    entry, batch_row, ledger_rows, msg = build(v, acc, results, os.path.basename(run), prev)
    if a.dry_run:
        sys.stdout.reconfigure(encoding='utf-8')
        print(entry); print('--- batch.md row\n' + batch_row); print('--- ledger rows\n' + '\n'.join(ledger_rows)); print('--- commit message\n' + msg)
        return
    append_changelog(entry, v['version'])
    in_batch = append_batch(batch_row)
    append_ledger(ledger_rows)
    git('add', 'driver/snakeoil3_v1.py', 'docs/CHANGELOG.md', 'docs/ledger.md', os.path.relpath(run, REPO))
    git('add', '-u', 'tools')
    git('commit', '-m', msg)
    git('tag', '-a', v['version'], '-m', msg)
    print('%s recorded: commit %s, tag %s, run %s%s' % (v['version'], git('rev-parse', '--short', 'HEAD'), v['version'], os.path.basename(run), '' if in_batch else ' (batch.md row not written: no table found)'))
    if v['decision'] == 'rejected':
        git('checkout', 'HEAD~1', '--', 'driver/snakeoil3_v1.py')
        git('commit', '-m', '%s rejected: driver restored to %s' % (v['version'], prev or 'the previous commit'))
        print('driver restored: commit %s' % git('rev-parse', '--short', 'HEAD'))
    print('Not pushed. Entry: %d characters; ledger rows: %d.' % (len(entry), len(ledger_rows)))

if __name__ == '__main__':
    main()
