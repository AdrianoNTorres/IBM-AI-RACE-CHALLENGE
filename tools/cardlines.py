"""Remap the tuning card's driver line references after the driver changed, and
check every knob row's line against the driver.

    python tools/cardlines.py --from v1.17            (dry run: prints what would change, then the check)
    python tools/cardlines.py --from v1.17 --write    (rewrites docs/tuning-card.md)
    python tools/cardlines.py                         (check only)

See tools/README.md, "cardlines.py".
"""
import argparse
import difflib
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DRIVER = 'driver/snakeoil3_v1.py'
CARD = os.path.join(ROOT, 'docs', 'tuning-card.md')

# "line 1172", "lines 872–887", "comment 872–881", "code 801–825", "lines 805 and 802"
REF = re.compile(r'\b(lines?|comments?|code)(\s+)(\d{2,4})((?:\s*[–-]\s*\d{2,4})?)((?:\s+and\s+\d{2,4})?)'
                 r'(?![\d.,]*\d|\s*(?:m|km/h|s|%|rpm|steps?|runs?|deg|laps?|times)\b)')
ROW = re.compile(r'^\| (.+?) \| (\d{1,4}(?:–\d{1,4})?) \|')


def line_map(old, new):
    """old line number (1-based) -> new line number."""
    m = {}
    sm = difflib.SequenceMatcher(None, old, new, autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        for k in range(i1, i2):
            if tag == 'equal':
                m[k + 1] = j1 + (k - i1) + 1
            else:
                # changed or removed: the same share of the way through the new block
                span = max(j2 - j1 - 1, 0)
                off = 0 if i2 - i1 <= 1 else round((k - i1) * span / (i2 - i1 - 1))
                m[k + 1] = min(j1 + off, len(new) - 1) + 1
    return m


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--from', dest='rev', help='git revision the card\'s line numbers describe (e.g. v1.17)')
    ap.add_argument('--write', action='store_true', help='rewrite the card (default: dry run)')
    ap.add_argument('--card', default=CARD)
    a = ap.parse_args()

    new = open(os.path.join(ROOT, DRIVER), encoding='utf-8').read().splitlines()
    text = open(a.card, encoding='utf-8').read()

    if a.rev:
        old = subprocess.run(['git', 'show', '%s:%s' % (a.rev, DRIVER)], cwd=ROOT, capture_output=True,
                             check=True).stdout.decode('utf-8').splitlines()
        m = line_map(old, new)
        mv = lambda s: str(m.get(int(s), int(s)))
        changes = []

        def ref(g):
            rng = re.sub(r'\d+', lambda x: mv(x.group()), g.group(4))
            also = re.sub(r'\d+', lambda x: mv(x.group()), g.group(5))
            out = g.group(1) + g.group(2) + mv(g.group(3)) + rng + also
            if out != g.group(0):
                changes.append('%s -> %s' % (g.group(0), out))
            return out

        lines = text.split('\n')
        for i, ln in enumerate(lines):
            r = ROW.match(ln)
            if r:
                col = re.sub(r'\d+', lambda x: mv(x.group()), r.group(2))
                if col != r.group(2):
                    changes.append('%s: column %s -> %s' % (r.group(1), r.group(2), col))
                head = '| %s | %s |' % (r.group(1), col)
                ln = head + REF.sub(ref, ln[r.end():])
            else:
                ln = REF.sub(ref, ln)
            lines[i] = ln
        text = '\n'.join(lines)
        for c in changes:
            print(c)
        print('%d references remapped from %s (%s)' % (len(changes), a.rev, 'written' if a.write else 'dry run'))
        if a.write:
            open(a.card, 'w', encoding='utf-8', newline='\n').write(text)

    # check: a row named after a knob must point at that knob's assignment
    bad = n = 0
    for ln in text.split('\n'):
        r = ROW.match(ln)
        if not r:
            continue
        name = re.fullmatch(r'`(\w+)`', r.group(1))
        if not name:
            continue
        n += 1
        span = [int(x) for x in r.group(2).split('–')]
        at = span[0]
        src = new[at - 1].strip() if at <= len(new) else ''
        # a range (a table with its comment) only has to contain the assignment
        if not any(re.match(r'\s*%s\s*=' % re.escape(name.group(1)), s) for s in new[at - 1:span[-1]]):
            bad += 1
            where = [k + 1 for k, s in enumerate(new) if re.match(r'\s*%s\s*=' % re.escape(name.group(1)), s)]
            print('MISMATCH %s: card line %d is "%s"; the driver assigns it at %s' % (name.group(1), at, src[:50], where[:3] or 'no line'))
    print('check: %d knob rows, %d mismatched' % (n, bad))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
