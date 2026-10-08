'''What each sub-agent (and the orchestrator) of a Claude Code session cost, from its transcript.

    python tools/agentcost.py                 # the newest session of this project that used sub-agents
    python tools/agentcost.py --all           # one line per session (averages over its sub-agents)
    python tools/agentcost.py <session id or folder> [--detail]

Per agent: turns (model calls), context at the first and the largest turn (thousand tokens),
processed = the context summed over all turns (million tokens; what the model read in total,
nearly all of it from the prompt cache), wall minutes from the first to the last timestamp,
minutes spent waiting for tools (races) and the rest (the model). --detail adds the tool calls
by kind, the files read and the characters written. The last column is the model the agent ran on; "by model" below the table adds every agent of the
session and the orchestrator per model, the figure to watch against the plan's limit.

Why "processed" and not the size reported when an agent ends: every turn reads the whole
context again, so the cost of a version is turns x context, and the reported size is only the
last turn's context. Transcripts are read from ~/.claude/projects/<this folder's slug>/.
'''
import argparse, collections, datetime, glob, json, os, re, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def project_dir():
    slug = re.sub(r'[^A-Za-z0-9]', '-', REPO)
    base = os.path.join(os.path.expanduser('~'), '.claude', 'projects')
    for d in os.listdir(base) if os.path.isdir(base) else []:
        if d.lower() == slug.lower(): return os.path.join(base, d)
    sys.exit('no transcripts found for %s under %s' % (REPO, base))

def ts(s):
    return datetime.datetime.fromisoformat(s.replace('Z', '+00:00'))

def analyse(path):
    ctx = collections.OrderedDict(); tools = collections.Counter(); bash = collections.Counter()
    reads = collections.Counter(); calls = {}; t_call = {}
    wait = 0.0; written = 0; first = last = None; out = {}; llm = collections.Counter()
    for line in open(path, encoding='utf-8'):
        if not line.strip(): continue
        r = json.loads(line); t = r.get('timestamp'); m = r.get('message') or {}
        if t: first = first or t; last = t
        if r.get('type') == 'assistant':
            u = m.get('usage') or {}
            out[m.get('id')] = max(out.get(m.get('id'), 0), u.get('output_tokens', 0))   # a message's lines repeat its usage
            if m.get('id') not in ctx:
                llm[short(m.get('model'))] += 1
                ctx[m.get('id')] = u.get('input_tokens', 0) + u.get('cache_read_input_tokens', 0) + u.get('cache_creation_input_tokens', 0)
            for c in m.get('content') or []:
                if c.get('type') != 'tool_use': continue
                i = c.get('input') or {}
                tools[c['name']] += 1; calls[c['id']] = (c['name'], i); t_call[c['id']] = t
                written += len(i.get('content', '') or i.get('new_string', '') or '')
                cmd = i.get('command', '')
                if cmd:
                    if '<<' in cmd: written += len(cmd)
                    ks = set(re.findall(r'tools[/\\](\w+)\.py', cmd)) or {'git' if re.search(r'\bgit ', cmd) else 'python' if 'python' in cmd else 'shell'}
                    for k in ks: bash[k] += 1
        elif r.get('type') == 'user' and isinstance(m.get('content'), list):
            for c in m['content']:
                if c.get('type') != 'tool_result' or c.get('tool_use_id') not in calls: continue
                name, i = calls[c['tool_use_id']]
                body = c.get('content')
                n = len(body) if isinstance(body, str) else sum(len(x.get('text', '')) for x in body or [] if isinstance(x, dict))
                if name == 'Read': reads[os.path.basename(i.get('file_path', ''))] += n
                if t and t_call.get(c['tool_use_id']): wait += (ts(t) - ts(t_call[c['tool_use_id']])).total_seconds()
    c = list(ctx.values())
    if not c or not first: return None
    wall = (ts(last) - ts(first)).total_seconds() / 60
    return dict(turns=len(c), first=c[0] / 1e3, peak=max(c) / 1e3, processed=sum(c) / 1e6, wall=wall, wait=wait / 60,
                model=wall - wait / 60, out=sum(out.values()) / 1e3, llm=llm.most_common(1)[0][0], start=first[:16].replace('T', ' '), tools=tools, bash=bash, reads=reads, written=written)

def short(model):
    m = re.match(r'claude-(\w+?)-(\d+)-(\d+)', model or '')
    return '%s %s.%s' % m.groups() if m else (model or '?')

def row(name, a):
    return '%-22s %5d %7.0f %7.0f %9.1f %7.1f %7.1f %7.1f %s' % (name, a['turns'], a['first'], a['peak'], a['processed'], a['wall'], a['wait'], a['model'], a['llm'])

HEAD = '%-22s %5s %7s %7s %9s %7s %7s %7s %s' % ('agent', 'turns', 'first k', 'peak k', 'proc. M', 'wall', 'tools', 'min.', 'ran on')

def session(path, detail):
    subs = sorted(glob.glob(os.path.join(path, 'subagents', '*.jsonl')), key=os.path.getmtime)
    print('session %s' % os.path.basename(path)); print(HEAD)
    tot = collections.Counter(); by = {}
    def add(a):
        b = by.setdefault(a['llm'], collections.Counter())
        b['n'] += 1; b['turns'] += a['turns']; b['processed'] += a['processed']; b['out'] += a['out']
    for f in subs:
        a = analyse(f)
        if not a: continue
        add(a)
        print(row(a['start'][5:] + ' ' + os.path.basename(f)[6:12], a))
        for k in ('turns', 'processed', 'wall', 'wait', 'model'): tot[k] += a[k]
        tot['n'] += 1
        if detail:
            print('    tools %s | commands %s' % (dict(a['tools']), dict(a['bash'].most_common(8))))
            print('    read (chars) %s | written ~%d chars' % (dict(a['reads'].most_common(6)), a['written']))
    if tot['n']:
        print('%-22s %5d %7s %7s %9.1f %7.1f %7.1f %7.1f' % ('sub-agents total (%d)' % tot['n'], tot['turns'], '', '', tot['processed'], tot['wall'], tot['wait'], tot['model']))
    main = path + '.jsonl'
    if os.path.exists(main):
        a = analyse(main)
        if a: print(row('orchestrator', a)); add(a)
    for k, b in sorted(by.items(), key=lambda x: -x[1]['processed']):
        print('by model  %-12s %3d agents %5d turns %7.1f M processed' % (k, b['n'], b['turns'], b['processed']))

def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('session', nargs='?', help='session id (or its start) or folder; default: the newest with sub-agents')
    ap.add_argument('--all', action='store_true', help='one line per session: averages over its sub-agents')
    ap.add_argument('--detail', action='store_true', help='tool calls, files read and characters written per agent')
    a = ap.parse_args()
    base = project_dir()
    dirs = sorted((d for d in glob.glob(os.path.join(base, '*')) if os.path.isdir(os.path.join(d, 'subagents'))), key=os.path.getmtime)
    if a.all:
        print('%-16s %-9s %6s %5s %7s %7s %9s %7s' % ('first agent', 'session', 'agents', 'turns', 'first k', 'peak k', 'proc. M', 'wall'))
        for d in dirs:
            ss = [s for s in (analyse(f) for f in sorted(glob.glob(os.path.join(d, 'subagents', '*.jsonl')), key=os.path.getmtime)) if s and s['turns'] >= 10]
            if not ss: continue
            av = lambda k: sum(s[k] for s in ss) / len(ss)
            print('%-16s %-9s %6d %5.0f %7.0f %7.0f %9.1f %7.1f' % (ss[0]['start'], os.path.basename(d)[:8], len(ss), av('turns'), av('first'), av('peak'), av('processed'), av('wall')))
        return
    if a.session:
        hit = [d for d in dirs if os.path.basename(d).startswith(a.session)] or ([a.session] if os.path.isdir(a.session) else [])
        if not hit: sys.exit('no session with sub-agents matches %r' % a.session)
        session(hit[-1], a.detail)
    elif dirs: session(dirs[-1], a.detail)
    else: sys.exit('no session with sub-agents in %s' % base)

if __name__ == '__main__':
    main()
