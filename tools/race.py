'''Run races in parallel without touching snakeoil3_v1.py.

    python tools/race.py                         # current driver, one race
    python tools/race.py --set brake_aero=0.0065 --set tc_slip=3
    python tools/race.py --variant my_driver.py --keep out.csv

How it works
- Each race gets a private copy of the driver (in WORK, under %TEMP%) with the
  knob overrides substituted into drive_example()'s knob block, the UDP port
  of its scr_server slot, and an explicit CSV path. Only harness lines change
  (port, log path, and the client's Linux "relaunch torcs" fallback, which is
  disabled); driving code is untouched, so an unmodified copy reproduces
  run_race.py byte for byte.
- TORCS slot N (scr_server N, port 3001+N, all slots car1-ow1 with identical
  setups) is raced from config/raceman/scr_p<N>.xml in the TORCS install, a
  copy of practice.xml with driver idx N, generated on demand.
- Slots 1..4 are used by default (-n up to 9: slots 1..9; slot 0 stays free
  for run_race.py); -n 10 adds slot 0. scr_server has 10 slots: the hard cap.
  Parallel runs were measured byte-identical to serial ones at every n
  (with wtorcs -t, see UDP_TIMEOUT_US).
- Race cache: the simulation is deterministic, so a finished race's CSV is
  stored (gzip) in WORK/cache under a hash of the exact driver source raced
  (knob overrides applied) and of the TORCS files that decide the result
  (race file, car, track, scr_server set-up). The same race asked for again
  is copied from the cache and no TORCS is started. Off with --no-cache or
  the environment variable TORCS_TOOLS_CACHE=0; `python tools/race.py
  --cache-info` / `--cache-clear` show / empty it. The least recently used
  entries are dropped beyond CACHE_MAX bytes.

Library use:  from race import run_batch, Job;  run_batch([Job('a', {'tc_slip': 3})])
'''
import argparse, gzip, hashlib, os, re, shutil, subprocess, sys, tempfile, threading, time, uuid
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DRIVER = os.path.join(REPO, 'driver', 'snakeoil3_v1.py')
TORCS_DIR = r'C:\torcs\torcs'
WORK = os.path.join(tempfile.gettempdir(), 'torcs_tools')
SLOTS = list(range(1, 10)) + [0]  # scr_server slots in order of use (port 3001+slot); slot 0 (run_race.py's) only at n=10
DEFAULT_N = 4                 # CPU heat (user, 2026-10-02: cores hit 100 C at 9-10); byte-identical at n=1,4,8,9,10
TIMEOUT = 120                 # s per race (a lap takes ~2 s)
UDP_TIMEOUT_US = 1000000      # wtorcs -t: how long the server waits for the client's answer each step
                              # (default 10 ms: under load a late answer is skipped and the last action
                              # reused, which breaks determinism; 1 s means it always waits)
CACHE_DIR = os.path.join(WORK, 'cache')
CACHE_VERSION = '1'           # raise when the harness changes what a race writes
CACHE_MAX = 3e9               # bytes kept (gzip); the least recently used entries are dropped first
USE_CACHE = os.environ.get('TORCS_TOOLS_CACHE', '1') != '0'
ENV_FILES = ['config/raceman/practice.xml', 'cars/car1-ow1/car1-ow1.xml', 'drivers/scr_server/scr_server.xml',
             'tracks/road/corkscrew/corkscrew.xml']
sys.path.insert(0, HERE)
from metrics import metrics, line   # noqa: E402

# ---------------------------------------------------------------- race cache
_env = []
def env_hash():
    '''Hash of the TORCS files that decide a race's result (computed once per process).'''
    if not _env:
        h = hashlib.sha256((CACHE_VERSION + str(UDP_TIMEOUT_US)).encode())
        for f in ENV_FILES:
            p = os.path.join(TORCS_DIR, f)
            h.update(open(p, 'rb').read() if os.path.exists(p) else b'missing')
        exe = os.path.join(TORCS_DIR, 'wtorcs.exe')
        h.update(str(os.path.getsize(exe) if os.path.exists(exe) else 0).encode())
        _env.append(h.hexdigest())
    return _env[0]

def cache_path(src):
    return os.path.join(CACHE_DIR, hashlib.sha256((env_hash() + src).encode('utf-8', 'replace')).hexdigest()[:40] + '.csv.gz')

def cache_get(src, csv_path):
    '''Copy the cached CSV of this exact driver source to csv_path; False if there is none.'''
    p = cache_path(src)
    if not (USE_CACHE and os.path.exists(p)): return False
    try:
        with gzip.open(p, 'rb') as f, open(csv_path, 'wb') as g: shutil.copyfileobj(f, g)
        os.utime(p)
        return True
    except (OSError, EOFError):
        return False

def cache_put(src, csv_path):
    if not USE_CACHE: return
    os.makedirs(CACHE_DIR, exist_ok=True)
    p = cache_path(src); tmp = p + '.%s.tmp' % uuid.uuid4().hex[:8]
    with open(csv_path, 'rb') as f, gzip.open(tmp, 'wb', compresslevel=5) as g: shutil.copyfileobj(f, g)
    os.replace(tmp, p)

def cache_prune(limit=None):
    '''Drop the least recently used entries beyond limit bytes; returns (entries, bytes) left.'''
    try: fs = sorted(((e.stat().st_mtime, e.stat().st_size, e.path) for e in os.scandir(CACHE_DIR) if e.name.endswith('.csv.gz')), reverse=True)
    except OSError: return 0, 0
    tot = kept = 0
    for _, size, p in fs:
        if tot + size > (CACHE_MAX if limit is None else limit):
            try: os.remove(p)
            except OSError: pass
        else: tot += size; kept += 1
    return kept, tot

# ---------------------------------------------------------------- driver source
KNOB_RE = re.compile(r'^(    )(\w+)=(\s*)([^\s#]+)', re.M)

def knob_block(src):
    '''(start, end) of drive_example()'s knob block.'''
    a = src.index('S,R= c.S.d,c.R.d')
    b = src.index('prev_steer=', a)
    return a, b

def knobs(src=None):
    '''{name: value} of the knobs in drive_example() (numbers as floats/ints).'''
    src = src if src is not None else open(DRIVER).read()
    a, b = knob_block(src)
    out = {}
    for m in KNOB_RE.finditer(src, a, b):
        try: out[m.group(2)] = eval(m.group(4), {})
        except Exception: pass
    return out

def fmt(v):
    if isinstance(v, str): return v
    if isinstance(v, float) and v == int(v) and abs(v) < 1e9: return repr(v)
    return repr(float('%.12g' % v)) if isinstance(v, float) else repr(v)

def apply_knobs(src, overrides):
    '''Return src with knob values replaced. Every name must exist exactly once in the knob block.'''
    a, b = knob_block(src)
    block = src[a:b]
    for name, val in (overrides or {}).items():
        pat = re.compile(r'^(    %s=\s*)([^\s#]+)' % re.escape(name), re.M)
        if len(pat.findall(block)) != 1:
            raise KeyError('knob %r not found exactly once in drive_example()' % name)
        block = pat.sub(lambda m: m.group(1) + fmt(val), block)
    return src[:a] + block + src[b:]

def harness(src, port, csv_path):
    '''Point a driver copy at a port and an explicit CSV path (harness lines only).'''
    subs = [("C= Client(p=3001)", "C= Client(p=%d)" % port),
            ("log_path= os.path.join(run_dir, time.strftime('run_%Y%m%d_%H%M%S.csv'))", "log_path= %r" % csv_path),
            ("if n_fail < 0:", "if False:  # harness: never 'relaunch torcs'")]
    for old, new in subs:
        if old.startswith('if n_fail') and old not in src: continue   # drivers after v1.33 have no relaunch
        if src.count(old) != 1: raise ValueError('driver harness line not found once: %r' % old)
        src = src.replace(old, new)
    return src

# ---------------------------------------------------------------- TORCS side
def race_file(slot):
    '''config/raceman/scr_p<slot>.xml (relative to TORCS_DIR), generated from practice.xml.'''
    rel = 'config/raceman/scr_p%d.xml' % slot
    path = os.path.join(TORCS_DIR, rel)
    src = open(os.path.join(TORCS_DIR, 'config/raceman/practice.xml')).read()
    new = src.replace('<attnum name="idx" val="0"/>', '<attnum name="idx" val="%d"/>' % slot)
    assert new.count('val="%d"/>' % slot) >= 2 or slot == 0
    if not os.path.exists(path) or open(path).read() != new:
        open(path, 'w').write(new)
    return rel

class Job:
    '''One race: knob overrides on top of a base driver file (default snakeoil3_v1.py).'''
    def __init__(self, label, overrides=None, variant=None, keep=None):
        self.label, self.overrides, self.variant, self.keep = label, dict(overrides or {}), variant, keep
    def source(self):
        return apply_knobs(open(self.variant or DRIVER).read(), self.overrides)

def run_one(src, slot, csv_path, timeout=TIMEOUT):
    '''Race one driver source on a slot; returns csv_path (or None if no CSV was written).'''
    d = os.path.join(WORK, 'w_%d_%s' % (slot, uuid.uuid4().hex[:8]))
    os.makedirs(d, exist_ok=True)
    drv = os.path.join(d, 'drv.py')
    open(drv, 'w', newline='').write(harness(src, 3001 + slot, csv_path))
    tlog = open(os.path.join(d, 'torcs.log'), 'w')
    torcs = subprocess.Popen([os.path.join(TORCS_DIR, 'wtorcs.exe'), '-r', race_file(slot)] + (['-t', str(UDP_TIMEOUT_US)] if UDP_TIMEOUT_US else []),
                             cwd=TORCS_DIR, stdout=tlog, stderr=subprocess.STDOUT)
    try:
        subprocess.run([sys.executable, '-W', 'ignore', drv], cwd=d, timeout=timeout,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        pass
    finally:
        try: torcs.wait(timeout=3)   # exits by itself after a finished lap; after a damage stop it would race on
        except subprocess.TimeoutExpired: torcs.kill(); torcs.wait()
        tlog.close()
        log = open(os.path.join(d, 'torcs.log'), errors='replace').read()
        shutil.rmtree(d, ignore_errors=True)
    ok = os.path.exists(csv_path) and os.path.getsize(csv_path) > 0
    return (csv_path if ok else None), log.count('Timeout for client answer'), log

# Slots are claimed machine-wide (a lock file per slot in WORK), so several harness processes
# (parallel agents) share slots 1..n instead of colliding on the same ports: at the default n
# there are never more than 4 TORCS at once in total.
SLOT_STALE = TIMEOUT + 60     # s; a lock older than any race can last was left by a killed process

def slot_lock(slot):
    return os.path.join(WORK, 'slot_%d.lock' % slot)

def claim_slot(slots):
    '''Block until one of slots is free on this machine; return it.'''
    os.makedirs(WORK, exist_ok=True)
    while True:
        for s in slots:
            p = slot_lock(s)
            try:
                if time.time() - os.path.getmtime(p) > SLOT_STALE: os.remove(p)
            except OSError:
                pass
            try:
                os.close(os.open(p, os.O_CREAT | os.O_EXCL | os.O_WRONLY))
                return s
            except OSError:
                pass
        time.sleep(0.1)

def release_slot(slot):
    try: os.remove(slot_lock(slot))
    except OSError: pass

def slots_in_use():
    '''True if another harness process holds a slot right now.'''
    for s in SLOTS:
        try:
            if time.time() - os.path.getmtime(slot_lock(s)) <= SLOT_STALE: return True
        except OSError:
            pass
    return False

def run_batch(jobs, n=DEFAULT_N, verbose=False):
    '''Run Jobs on up to n slots at once. Returns [(job, metrics dict or None)] in job order.
    CSVs go to WORK and are deleted unless job.keep names a path to keep it at.'''
    os.makedirs(WORK, exist_ok=True)
    n = max(1, min(n, len(SLOTS)))
    lock = threading.Lock()
    def work(job):
        src = job.source()            # raises early on a bad knob name
        csv_path = os.path.join(WORK, 'r_c_%s.csv' % uuid.uuid4().hex[:8])
        cached = cache_get(src, csv_path)
        if cached:
            out, timeouts = csv_path, 0
        else:
            slot = claim_slot(SLOTS[:n])
            try:
                csv_path = os.path.join(WORK, 'r_%d_%s.csv' % (slot, uuid.uuid4().hex[:8]))
                out, timeouts, _ = run_one(src, slot, csv_path)
            finally:
                release_slot(slot)
        m = metrics(out) if out else None
        if m is not None:
            m['timeouts'] = timeouts   # server steps that skipped the client (should be 0)
            m['cached'] = cached
            # only a deterministic result is stored: no skipped server step (a run the driver ended
            # early leaves one harmless timeout after the client quit)
            if not cached and (timeouts == 0 or not m['finished']): cache_put(src, out)
        # A run the driver ended early (damage stop: the damaged step is not logged, so it shows as
        # not finished) leaves the server one harmless timeout after the client quit.
        if timeouts and (m is None or m['finished']):
            with lock: print('WARNING %s: %d server timeouts (run not deterministic)' % (job.label, timeouts), flush=True)
        if out:
            if job.keep: shutil.move(out, job.keep); m['csv'] = job.keep
            else: os.remove(out)
        if verbose:
            with lock: print('%-24s %s' % (job.label, line(m)), flush=True)
        return job, m
    with ThreadPoolExecutor(n) as ex:
        return list(ex.map(work, jobs))

def parse_sets(sets):
    '''["a=1", "b=2e-4"] -> {"a": 1, "b": 0.0002}'''
    out = {}
    for s in sets or []:
        k, v = s.split('=', 1)
        try: out[k.strip()] = eval(v, {})
        except Exception: out[k.strip()] = v.strip()
    return out

def check_no_torcs():
    '''Exit if a TORCS is running that is not another harness process's race.'''
    for _ in range(5):
        if slots_in_use(): return
        out = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq wtorcs.exe'], capture_output=True, text=True).stdout
        if 'wtorcs.exe' not in out: return
        time.sleep(1)             # a harness race may have just ended; look again
    sys.exit('A TORCS (wtorcs.exe) is already running; close it first (it may hold a slot port).')

def count_raced(res):
    '''(races run, races taken from the cache) of a run_batch result.'''
    c = sum(1 for _, m in res if m and m.get('cached'))
    return len(res) - c, c

if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Run one race (or several identical ones) and print metrics.')
    ap.add_argument('--set', action='append', help='knob=value override (repeatable)')
    ap.add_argument('--variant', help='driver file to use instead of snakeoil3_v1.py')
    ap.add_argument('--keep', help='save the CSV at this path')
    ap.add_argument('--repeat', type=int, default=1, help='run the same config this many times in parallel')
    ap.add_argument('-n', type=int, default=DEFAULT_N)
    ap.add_argument('--no-cache', action='store_true', help='race even if this exact race is in the cache, and do not store it')
    ap.add_argument('--cache-info', action='store_true', help='print the cache size and stop')
    ap.add_argument('--cache-clear', action='store_true', help='empty the cache and stop')
    a = ap.parse_args()
    if a.cache_info or a.cache_clear:
        k, b = cache_prune(0 if a.cache_clear else None)
        sys.exit('cache %s: %d races, %.1f MB' % (CACHE_DIR, k, b / 1e6))
    if a.no_cache: USE_CACHE = False
    check_no_torcs()
    ov = parse_sets(a.set)
    jobs = [Job('run%d' % i, ov, a.variant, a.keep if i == 0 else None) for i in range(a.repeat)]
    t0 = time.time()
    res = run_batch(jobs, a.n, verbose=True)
    print('%d raced, %d from the cache, %.1f s' % (count_raced(res) + (time.time() - t0,)))
    cache_prune()
