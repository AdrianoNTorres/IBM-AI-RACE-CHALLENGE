'''Run one race without the TORCS menus and print the lap result.

    python harness/run_race.py

Starts TORCS with a race file (`wtorcs.exe -r <race>.xml`: no menus, no
graphics, runs as fast as the computer allows, ~2 s per lap), drives it with
driver/snakeoil3_v1.py (which writes runs/run_<date>_<time>.csv), makes sure TORCS
has closed, then prints lap_report.py for the new run.

The simulation is deterministic: the first run in this mode reproduced the
user's on-screen v0.38 run in all 4,220 rows (1:27.57). In this mode the log
also continues a few steps past the line, so the CSV carries TORCS's own
lap time (lastLapTime).

TORCS must not already be running (it would hold the driver's UDP port 3001).
The race file is the one the user set up in the TORCS menus (Corkscrew,
1 lap, scr_server 0). TORCS is started without -nodamage, so damage counts
and the driver's damage stop works.'''
import glob, os, subprocess, sys, time

TORCS_DIR = r'C:\torcs\torcs'
RACE_FILE = 'config/raceman/practice.xml'   # relative to TORCS_DIR, so TORCS can also save its results file
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
TIMEOUT = 300   # s; a lap takes ~2 s in this mode

def torcs_running():
    out = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq wtorcs.exe'], capture_output=True, text=True).stdout
    return 'wtorcs.exe' in out

def main():
    if len(sys.argv) > 1 and sys.argv[1] in ('-h', '--help'): sys.exit(print(__doc__))
    if torcs_running():
        sys.exit('TORCS is already running. Close it first (it holds the driver\'s port 3001).')
    before = set(glob.glob(os.path.join(REPO, 'runs', '*.csv')))
    torcs = subprocess.Popen([os.path.join(TORCS_DIR, 'wtorcs.exe'), '-r', RACE_FILE], cwd=TORCS_DIR)
    time.sleep(2)   # let TORCS load the track and open the port
    try:
        subprocess.run([sys.executable, '-W', 'ignore', os.path.join(REPO, 'driver', 'snakeoil3_v1.py')], cwd=REPO,
                       timeout=TIMEOUT, stdout=subprocess.DEVNULL)
    finally:
        try:
            torcs.wait(timeout=10)
        except subprocess.TimeoutExpired:
            torcs.kill()
    new = sorted(set(glob.glob(os.path.join(REPO, 'runs', '*.csv'))) - before)
    if not new:
        sys.exit('No new telemetry file was written.')
    sys.path.insert(0, HERE)
    import lap_report
    lap_report.report(new[-1])

if __name__ == '__main__':
    main()
