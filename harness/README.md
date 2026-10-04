# Harness

Run one lap and print the result:

```
python harness/run_race.py
```

TORCS must be installed at `C:\torcs\torcs` and must not already be running.
The script starts TORCS headlessly, drives one lap with `driver/snakeoil3_v1.py`,
and prints the lap time, top speed, slowest corner, damage, and max track position.

To read results from an existing telemetry file:

```
python harness/lap_report.py runs/run_YYYYMMDD_HHMMSS.csv
```
