import socket
import sys
import getopt
import os
import time
PI= 3.14159265359
TRACK_SENSOR_ANGLES = (-90, -60, -40, -25, -15, -8, -4, -2, -1, 0, 1, 2, 4, 8, 15, 25, 40, 60, 90)

data_size = 2**17

ophelp=  'Options:\n'
ophelp+= ' --host, -H <host>    TORCS server host. [localhost]\n'
ophelp+= ' --port, -p <port>    TORCS port. [3001]\n'
ophelp+= ' --id, -i <id>        ID for server. [SCR]\n'
ophelp+= ' --steps, -m <#>      Maximum simulation steps. 1 sec ~ 50 steps. [100000]\n'
ophelp+= ' --episodes, -e <#>   Maximum learning episodes. [1]\n'
ophelp+= ' --track, -t <track>  Your name for this track. Used for learning. [unknown]\n'
ophelp+= ' --stage, -s <#>      0=warm up, 1=qualifying, 2=race, 3=unknown. [3]\n'
ophelp+= ' --debug, -d          Output full telemetry.\n'
ophelp+= ' --help, -h           Show this help.\n'
ophelp+= ' --version, -v        Show current version.'
usage= 'Usage: %s [ophelp [optargs]] \n' % sys.argv[0]
usage= usage + ophelp
version= "20130505-2"

def clip(v,lo,hi):
    if v<lo: return lo
    elif v>hi: return hi
    else: return v

def bargraph(x,mn,mx,w,c='X'):
    '''Draws a simple asciiart bar graph. Very handy for
    visualizing what's going on with the data.
    x= Value from sensor, mn= minimum plottable value,
    mx= maximum plottable value, w= width of plot in chars,
    c= the character to plot with.'''
    if not w: return '' # No width!
    if x<mn: x= mn      # Clip to bounds.
    if x>mx: x= mx      # Clip to bounds.
    tx= mx-mn # Total real units possible to show on graph.
    if tx<=0: return 'backwards' # Stupid bounds.
    upw= tx/float(w) # X Units per output char width.
    if upw<=0: return 'what?' # Don't let this happen.
    negpu, pospu, negnonpu, posnonpu= 0,0,0,0
    if mn < 0: # Then there is a negative part to graph.
        if x < 0: # And the plot is on the negative side.
            negpu= -x + min(0,mx)
            negnonpu= -mn + x
        else: # Plot is on pos. Neg side is empty.
            negnonpu= -mn + min(0,mx) # But still show some empty neg.
    if mx > 0: # There is a positive part to the graph
        if x > 0: # And the plot is on the positive side.
            pospu= x - max(0,mn)
            posnonpu= mx - x
        else: # Plot is on neg. Pos side is empty.
            posnonpu= mx - max(0,mn) # But still show some empty pos.
    nnc= int(negnonpu/upw)*'-'
    npc= int(negpu/upw)*c
    ppc= int(pospu/upw)*c
    pnc= int(posnonpu/upw)*'_'
    return '[%s]' % (nnc+npc+ppc+pnc)

class Client():
    def __init__(self,H=None,p=None,i=None,e=None,t=None,s=None,d=None,vision=False):
        self.vision = vision

        self.host= 'localhost'
        self.port= 3001
        self.sid= 'SCR'
        self.maxEpisodes=1 # "Maximum number of learning episodes to perform"
        self.trackname= 'unknown'
        self.stage= 3 # 0=Warm-up, 1=Qualifying 2=Race, 3=unknown <Default=3>
        self.debug= False
        self.maxSteps= 100000  # 50steps/second
        self.parse_the_command_line()
        if H: self.host= H
        if p: self.port= p
        if i: self.sid= i
        if e: self.maxEpisodes= e
        if t: self.trackname= t
        if s: self.stage= s
        if d: self.debug= d
        self.S= ServerState()
        self.R= DriverAction()
        self.setup_connection()

    def setup_connection(self):
        try:
            self.so= socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        except socket.error as emsg:
            print('Error: Could not create socket...')
            sys.exit(-1)
        self.so.settimeout(1)

        n_fail = 5
        while True:
            a = ' '.join(str(x) for x in TRACK_SENSOR_ANGLES)

            initmsg='%s(init %s)' % (self.sid,a)

            try:
                self.so.sendto(initmsg.encode(), (self.host, self.port))
            except socket.error as emsg:
                sys.exit(-1)
            sockdata= str()
            try:
                sockdata,addr= self.so.recvfrom(data_size)
                sockdata = sockdata.decode('utf-8')
            except socket.error as emsg:
                print("Waiting for server on %d............" % self.port)
                print("Count Down : " + str(n_fail))
                if n_fail < 0:
                    print("relaunch torcs")
                    os.system('pkill torcs')
                    time.sleep(1.0)
                    if self.vision is False:
                        os.system('torcs -nofuel -nodamage -nolaptime &')
                    else:
                        os.system('torcs -nofuel -nodamage -nolaptime -vision &')

                    time.sleep(1.0)
                    os.system('sh autostart.sh')
                    n_fail = 5
                n_fail -= 1

            identify = '***identified***'
            if identify in sockdata:
                print("Client connected on %d.............." % self.port)
                break

    def parse_the_command_line(self):
        try:
            (opts, args) = getopt.getopt(sys.argv[1:], 'H:p:i:m:e:t:s:dhv',
                       ['host=','port=','id=','steps=',
                        'episodes=','track=','stage=',
                        'debug','help','version'])
        except getopt.error as why:
            print('getopt error: %s\n%s' % (why, usage))
            sys.exit(-1)
        try:
            for opt in opts:
                if opt[0] == '-h' or opt[0] == '--help':
                    print(usage)
                    sys.exit(0)
                if opt[0] == '-d' or opt[0] == '--debug':
                    self.debug= True
                if opt[0] == '-H' or opt[0] == '--host':
                    self.host= opt[1]
                if opt[0] == '-i' or opt[0] == '--id':
                    self.sid= opt[1]
                if opt[0] == '-t' or opt[0] == '--track':
                    self.trackname= opt[1]
                if opt[0] == '-s' or opt[0] == '--stage':
                    self.stage= int(opt[1])
                if opt[0] == '-p' or opt[0] == '--port':
                    self.port= int(opt[1])
                if opt[0] == '-e' or opt[0] == '--episodes':
                    self.maxEpisodes= int(opt[1])
                if opt[0] == '-m' or opt[0] == '--steps':
                    self.maxSteps= int(opt[1])
                if opt[0] == '-v' or opt[0] == '--version':
                    print('%s %s' % (sys.argv[0], version))
                    sys.exit(0)
        except ValueError as why:
            print('Bad parameter \'%s\' for option %s: %s\n%s' % (
                                       opt[1], opt[0], why, usage))
            sys.exit(-1)
        if len(args) > 0:
            print('Superflous input? %s\n%s' % (', '.join(args), usage))
            sys.exit(-1)

    def get_servers_input(self):
        '''Server's input is stored in a ServerState object'''
        if not self.so: return
        sockdata= str()

        while True:
            try:
                sockdata,addr= self.so.recvfrom(data_size)
                sockdata = sockdata.decode('utf-8')
            except socket.error as emsg:
                print('.', end=' ')
            if '***identified***' in sockdata:
                print("Client connected on %d.............." % self.port)
                continue
            elif '***shutdown***' in sockdata:
                print((("Server has stopped the race on %d. "+
                        "You were in %d place.") %
                        (self.port,self.S.d['racePos'])))
                self.shutdown()
                return
            elif '***restart***' in sockdata:
                print("Server has restarted the race on %d." % self.port)
                self.shutdown()
                return
            elif not sockdata: # Empty?
                continue       # Try again.
            else:
                self.S.parse_server_str(sockdata)
                if self.debug:
                    sys.stderr.write("\x1b[2J\x1b[H") # Clear for steady output.
                    print(self.S)
                break # Can now return from this function.

    def respond_to_server(self):
        if not self.so: return
        try:
            message = repr(self.R)
            self.so.sendto(message.encode(), (self.host, self.port))
        except socket.error as emsg:
            print("Error sending to server: %s Message %s" % (emsg[1],str(emsg[0])))
            sys.exit(-1)
        if self.debug: print(self.R.fancyout())

    def shutdown(self):
        if not self.so: return
        print(("Race terminated or %d steps elapsed. Shutting down %d."
               % (self.maxSteps,self.port)))
        self.so.close()
        self.so = None

class ServerState():
    '''What the server is reporting right now.'''
    def __init__(self):
        self.servstr= str()
        self.d= dict()

    def parse_server_str(self, server_string):
        '''Parse the server string.'''
        self.servstr= server_string.strip()[:-1]
        sslisted= self.servstr.strip().lstrip('(').rstrip(')').split(')(')
        for i in sslisted:
            w= i.split(' ')
            self.d[w[0]]= destringify(w[1:])

    def __repr__(self):
        return self.fancyout()
        out= str()
        for k in sorted(self.d):
            strout= str(self.d[k])
            if type(self.d[k]) is list:
                strlist= [str(i) for i in self.d[k]]
                strout= ', '.join(strlist)
            out+= "%s: %s\n" % (k,strout)
        return out

    def fancyout(self):
        '''Specialty output for useful ServerState monitoring.'''
        out= str()
        sensors= [ # Select the ones you want in the order you want them.
        'stucktimer',
        'fuel',
        'distRaced',
        'distFromStart',
        'opponents',
        'wheelSpinVel',
        'z',
        'speedZ',
        'speedY',
        'speedX',
        'targetSpeed',
        'rpm',
        'skid',
        'slip',
        'track',
        'trackPos',
        'angle',
        ]

        for k in sensors:
            if type(self.d.get(k)) is list: # Handle list type data.
                if k == 'track': # Nice display for track sensors.
                    strout= str()
                    raw_tsens= ['%.1f'%x for x in self.d['track']]
                    strout+= ' '.join(raw_tsens[:9])+'_'+raw_tsens[9]+'_'+' '.join(raw_tsens[10:])
                elif k == 'opponents': # Nice display for opponent sensors.
                    strout= str()
                    for osensor in self.d['opponents']:
                        if   osensor >190: oc= '_'
                        elif osensor > 90: oc= '.'
                        elif osensor > 39: oc= chr(int(osensor/2)+97-19)
                        elif osensor > 13: oc= chr(int(osensor)+65-13)
                        elif osensor >  3: oc= chr(int(osensor)+48-3)
                        else: oc= '?'
                        strout+= oc
                    strout= ' -> '+strout[:18] + ' ' + strout[18:]+' <-'
                else:
                    strlist= [str(i) for i in self.d[k]]
                    strout= ', '.join(strlist)
            else: # Not a list type of value.
                if k == 'gear': # This is redundant now since it's part of RPM.
                    gs= '_._._._._._._._._'
                    p= int(self.d['gear']) * 2 + 2  # Position
                    l= '%d'%self.d['gear'] # Label
                    if l=='-1': l= 'R'
                    if l=='0':  l= 'N'
                    strout= gs[:p]+ '(%s)'%l + gs[p+3:]
                elif k == 'damage':
                    strout= '%6.0f %s' % (self.d[k], bargraph(self.d[k],0,10000,50,'~'))
                elif k == 'fuel':
                    strout= '%6.0f %s' % (self.d[k], bargraph(self.d[k],0,100,50,'f'))
                elif k == 'speedX':
                    cx= 'X'
                    if self.d[k]<0: cx= 'R'
                    strout= '%6.1f %s' % (self.d[k], bargraph(self.d[k],-30,300,50,cx))
                elif k == 'speedY': # This gets reversed for display to make sense.
                    strout= '%6.1f %s' % (self.d[k], bargraph(self.d[k]*-1,-25,25,50,'Y'))
                elif k == 'speedZ':
                    strout= '%6.1f %s' % (self.d[k], bargraph(self.d[k],-13,13,50,'Z'))
                elif k == 'z':
                    strout= '%6.3f %s' % (self.d[k], bargraph(self.d[k],.3,.5,50,'z'))
                elif k == 'trackPos': # This gets reversed for display to make sense.
                    cx='<'
                    if self.d[k]<0: cx= '>'
                    strout= '%6.3f %s' % (self.d[k], bargraph(self.d[k]*-1,-1,1,50,cx))
                elif k == 'stucktimer':
                    if self.d[k]:
                        strout= '%3d %s' % (self.d[k], bargraph(self.d[k],0,300,50,"'"))
                    else: strout= 'Not stuck!'
                elif k == 'rpm':
                    g= self.d['gear']
                    if g < 0:
                        g= 'R'
                    else:
                        g= '%1d'% g
                    strout= bargraph(self.d[k],0,10000,50,g)
                elif k == 'angle':
                    asyms= [
                          "  !  ", ".|'  ", "./'  ", "_.-  ", ".--  ", "..-  ",
                          "---  ", ".__  ", "-._  ", "'-.  ", "'\.  ", "'|.  ",
                          "  |  ", "  .|'", "  ./'", "  .-'", "  _.-", "  __.",
                          "  ---", "  --.", "  -._", "  -..", "  '\.", "  '|."  ]
                    rad= self.d[k]
                    deg= int(rad*180/PI)
                    symno= int(.5+ (rad+PI) / (PI/12) )
                    symno= symno % (len(asyms)-1)
                    strout= '%5.2f %3d (%s)' % (rad,deg,asyms[symno])
                elif k == 'skid': # A sensible interpretation of wheel spin.
                    frontwheelradpersec= self.d['wheelSpinVel'][0]
                    skid= 0
                    if frontwheelradpersec:
                        skid= .5555555555*self.d['speedX']/frontwheelradpersec - .66124
                    strout= bargraph(skid,-.05,.4,50,'*')
                elif k == 'slip': # A sensible interpretation of wheel spin.
                    frontwheelradpersec= self.d['wheelSpinVel'][0]
                    slip= 0
                    if frontwheelradpersec:
                        slip= ((self.d['wheelSpinVel'][2]+self.d['wheelSpinVel'][3]) -
                              (self.d['wheelSpinVel'][0]+self.d['wheelSpinVel'][1]))
                    strout= bargraph(slip,-5,150,50,'@')
                else:
                    strout= str(self.d[k])
            out+= "%s: %s\n" % (k,strout)
        return out

class DriverAction():
    '''What the driver is intending to do (i.e. send to the server).
    Composes something like this for the server:
    (accel 1)(brake 0)(gear 1)(steer 0)(clutch 0)(focus 0)(meta 0) or
    (accel 1)(brake 0)(gear 1)(steer 0)(clutch 0)(focus -90 -45 0 45 90)(meta 0)'''
    def __init__(self):
       self.actionstr= str()
       self.d= { 'accel':0.2,
                   'brake':0,
                  'clutch':0,
                    'gear':1,
                   'steer':0,
                   'focus':[-90,-45,0,45,90],
                    'meta':0
                    }

    def clip_to_limits(self):
        """There pretty much is never a reason to send the server
        something like (steer 9483.323). This comes up all the time
        and it's probably just more sensible to always clip it than to
        worry about when to. The "clip" command is still a snakeoil
        utility function, but it should be used only for non standard
        things or non obvious limits (limit the steering to the left,
        for example). For normal limits, simply don't worry about it."""
        self.d['steer']= clip(self.d['steer'], -1, 1)
        self.d['brake']= clip(self.d['brake'], 0, 1)
        self.d['accel']= clip(self.d['accel'], 0, 1)
        self.d['clutch']= clip(self.d['clutch'], 0, 1)
        if self.d['gear'] not in [-1, 0, 1, 2, 3, 4, 5, 6]:
            self.d['gear']= 0
        if self.d['meta'] not in [0,1]:
            self.d['meta']= 0
        if type(self.d['focus']) is not list or min(self.d['focus'])<-180 or max(self.d['focus'])>180:
            self.d['focus']= 0

    def __repr__(self):
        self.clip_to_limits()
        out= str()
        for k in self.d:
            out+= '('+k+' '
            v= self.d[k]
            if not type(v) is list:
                out+= '%.3f' % v
            else:
                out+= ' '.join([str(x) for x in v])
            out+= ')'
        return out
        return out+'\n'

    def fancyout(self):
        '''Specialty output for useful monitoring of bot's effectors.'''
        out= str()
        od= self.d.copy()
        od.pop('gear','') # Not interesting.
        od.pop('meta','') # Not interesting.
        od.pop('focus','') # Not interesting. Yet.
        for k in sorted(od):
            if k == 'clutch' or k == 'brake' or k == 'accel':
                strout=''
                strout= '%6.3f %s' % (od[k], bargraph(od[k],0,1,50,k[0].upper()))
            elif k == 'steer': # Reverse the graph to make sense.
                strout= '%6.3f %s' % (od[k], bargraph(od[k]*-1,-1,1,50,'S'))
            else:
                strout= str(od[k])
            out+= "%s: %s\n" % (k,strout)
        return out

def destringify(s):
    '''makes a string into a value or a list of strings into a list of
    values (if possible)'''
    if not s: return s
    if type(s) is str:
        try:
            return float(s)
        except ValueError:
            print("Could not find a value in %s" % s)
            return s
    elif type(s) is list:
        if len(s) < 2:
            return destringify(s[0])
        else:
            return [destringify(i) for i in s]

#############################################
# MODULAR DRIVE LOGIC WITH USER PARAMETERS  #
#############################################

import bisect
import json
import math

# ================= CAR CONSTANTS (from car1-ow1.xml) =================
WHEELBASE = 2.95                  # front axle x=1.60 + rear axle x=-1.35 (m)
STEER_LOCK = math.radians(21.0)   # steer command +-1 == +-21 deg at the wheels
FRONT_WHEEL_R = 0.3024            # 12in rim + 150 mm sidewall (m)
REAR_WHEEL_R = 0.3151             # 13in rim + 150 mm sidewall (m)
GEAR_RATIOS = [3.9, 2.9, 2.3, 1.87, 1.68, 1.54]   # gears 1-6 (client cannot select 7th)
G = 9.81
DT = 0.02                         # one simulation step (s)

# ================= USER CONFIGURABLE PARAMETERS =================
# --- Speed / grip model ---
TARGET_SPEED = 330       # km/h hard cap (car tops out around 320).
LATERAL_ACCEL = 9.0      # m/s^2 of tyre grip at low speed before the online adaptation scales it.
AERO_GRIP = 0.0015       # extra m/s^2 of grip per (m/s)^2 from wings/body downforce.
GRIP_MIN = 0.6           # online grip multiplier limits (x LATERAL_ACCEL). 1.6 ~ tyre mu of 1.6.
GRIP_MAX = 1.6
GRIP_UP = 0.0004         # per step, while cornering near the limit without sliding.
GRIP_DOWN = 0.997        # per step multiplier while sliding.
GRIP_OFFTRACK_HIT = 0.93 # one-off multiplier each time the car leaves the track.
SLIDE_LIMIT = 0.12       # |speedY|/speedX above this counts as sliding.
SLIDE_OK = 0.06          # below this the car is considered stable enough to try more grip.

# --- Curvature / visibility model ---
CHORD_K = 1.5            # R ~ D^2 / (CHORD_K * width) from the longest forward sight line D.
MIN_RADIUS = 6.0        # m
V_BLIND = 14.0           # m/s (~50 km/h) the car must be able to reach by the end of visible road (hairpin speed).
VIS_MARGIN = 15.0        # m of visible road kept in reserve.
SIGHT_BONUS = 30.0       # m of extra clearance assumed when the sensors max out (200 m).
BRAKE_PLAN = 0.55        # fraction of grip used when PLANNING braking (rest is reserve).

# --- Braking ---
BRAKE_MAX_FRAC = 0.95    # fraction of grip that may be demanded as deceleration.
BRAKE_CMD_PER_MS2 = 0.02 # brake pedal per m/s^2 of wanted decel (brakes are very strong on this car).
BRAKE_P_GAIN = 3.0       # extra m/s^2 of decel per m/s over the target.
BRAKE_LEAD = 1.5         # start anticipating when within this many m/s of the target.
BRAKE_ON = 0.6           # m/s^2 below which the car coasts instead of braking.
BRAKE_RISE = 0.12        # max brake increase per step.
BRAKE_FALL = 0.40        # max brake decrease per step.
TGT_FALL_ALPHA = 0.5     # low-pass on the speed target when it drops.
TGT_RISE_ALPHA = 0.10    # low-pass on the speed target when it rises.

# --- ABS ---
ABS_SLIP_HI = 0.22       # release brake above this slip ratio.
ABS_SLIP_LO = 0.12       # re-apply below this slip ratio.
ABS_CUT = 0.8            # brake multiplier per step while locking.
ABS_RECOVER = 0.10       # brake multiplier recovery per step.
ABS_MIN_SCALE = 0.35
ABS_MIN_SPEED = 6.0      # m/s, ABS is inactive below this.

# --- Throttle / traction ---
THR_RISE = 0.12          # max throttle increase per step.
THR_P_GAIN = 0.35        # throttle per m/s below the target.
TC_ALLOW_BASE = 1.0      # m/s of rear wheel over-speed always tolerated.
TC_ALLOW_REL = 0.05      # plus this fraction of car speed.
TC_GAIN = 0.25           # throttle cut per m/s beyond the allowance.
TC_MAX_CUT = 0.8
ENABLE_TRACTION_CONTROL = True

# --- Steering ---
STEER_GAIN = 30          # heading-hold gain (before speed scaling).
CENTERING_GAIN = 0.20    # pull toward the racing line.
LOOKAHEAD_GAIN = 3.0     # pull toward the most open road ahead.
STEER_V_REF = 15.0       # m/s, full gain up to this speed.
STEER_GAIN_EXP = 1.0     # gain falls as (V_REF/v)^exp above it.
STEER_MIN_SCALE = 0.06
STEER_CAP_MARGIN = 2.0   # steering cap = margin * grip-limited angle + STEER_CAP_ADD.
STEER_CAP_ADD = 0.05     # rad
STEER_RATE_MAX = 0.18    # max steer change per step at low speed.
STEER_RATE_MIN = 0.03    # ... and at high speed.

# --- Racing line (out-in-out) ---
LINE_BOUND = 0.65        # |trackPos| target limit (track edges are +-1).
LINE_ENTRY = 0.45        # how far to the outside on entry.
LINE_APEX = 0.45         # how far to the inside at the apex.
LINE_EXIT = 0.50         # how far to the outside on exit.
LINE_RATE = 0.006        # max target movement per step.
LOOK_FILTER = 0.15
APEX_MAG = 0.35          # lookahead magnitude that always counts as apex phase.

# --- Track memory: learn the road on lap 1, use it from then on ---
BIN = 5.0                # m per map cell.
MAP_AHEAD = 450.0        # m of learned road the speed planner looks at (sensors only see 200 m).
CORNER_R = 250.0         # radius below which a stretch counts as a corner for the racing line.
LATE_APEX = 0.2          # apex placed this fraction of the way from the true apex to the exit.
LINE_PREVIEW = 0.6       # s: aim the learned line this far ahead of the car.
LINE_RATE_MAP = 0.02     # max line-target change per step when following the learned line.
MAP_PENALTY = 0.85       # radius multiplier for the ~100 m before an off-track event.
MAP_FILE = 'torcs_map_corkscrew.json'   # remembered between runs; delete it to relearn the track.
LOAD_MAP = True
SAVE_MAP = True
STEER_SMOOTH = 0.6       # 1.0 = no smoothing, lower = smoother steering.

# --- Gearbox ---
UPSHIFT_RPM = 18300
DOWNSHIFT_RPM = 10500
BRAKE_DOWNSHIFT_RPM = 8500   # delay downshifts under braking to avoid rear lock.
DOWNSHIFT_MAX_AFTER = 17800
SHIFT_COOLDOWN = 12          # steps

# ================= INTERNAL STATE =================
_step = 0
_grip_scale = 1.0
_was_off = False
_width_est = 12.0
_vtgt_f = None
_vtgt_prev = None
_aff_f = 0.0
_brake_prev = 0.0
_thr_prev = 0.0
_steer_prev = 0.0
_abs_scale = 1.0
_front_k = 1.0
_rear_k = 1.0
_look_f = 0.0
_mag_slow = 0.0
_phase = 0
_look_peak = 0.0
_corner_sign = 1.0
_line_cmd = 0.0
_last_shift_step = -1000
_last_lap_time = 0.0
_map_R = {}          # cell -> corner radius estimate (m)
_map_sgn = {}        # cell -> turn direction (+ = left, same sign as the look-ahead value)
_line_map = []       # cell -> lateral line target
_nb = 0              # number of cells on the lap (0 until the lap length is known)
_track_len = 0.0
_max_dist = 0.0
_prev_dist = None
_lap = 0
_map_ready = False

# ================= HELPER FUNCTIONS =================
def track_readings(S):
    track = S.get('track')
    if not isinstance(track, list) or len(track) < 19:
        return None
    return track

def is_off_track(S):
    if abs(S.get('trackPos', 0.0)) >= 1.0:
        return True
    track = track_readings(S)
    if track is None:
        return True
    return sum(1 for d in track if d >= 0) < 3

def lookahead_steer(S):
    '''Aim at the opening in the road, not the current heading, so corners are seen early.'''
    track = track_readings(S)
    if track is None:
        return 0.0
    best_i = None
    best_d = -1.0
    moment = 0.0
    weight = 0.0
    for i, dist in enumerate(track):
        if dist < 0:
            continue
        ang = TRACK_SENSOR_ANGLES[i]
        w = dist * dist * dist
        moment += w * (-ang / 90.0)
        weight += w
        if dist > best_d:
            best_d = dist
            best_i = i
    if best_i is None or best_d <= 0 or weight <= 0:
        return 0.0
    left = max((track[i] for i in range(0, 9) if track[i] >= 0), default=0.0)
    right = max((track[i] for i in range(10, 19) if track[i] >= 0), default=0.0)
    ahead = track[9] if track[9] >= 0 else 0.0
    opening = max(left, right) - ahead
    if left >= right:
        contrast = min(1.0, max(0.0, opening) / 70.0)
    else:
        contrast = -min(1.0, max(0.0, opening) / 70.0)
    argmax_aim = -TRACK_SENSOR_ANGLES[best_i] / 90.0
    weighted = moment / weight
    aim = 0.35 * weighted + 0.35 * argmax_aim + 0.30 * contrast
    return max(-1.0, min(1.0, aim))

# ---------- grip model (7) ----------
def lat_accel_limit(v):
    '''Lateral (and braking) grip available at speed v, in m/s^2.'''
    return _grip_scale * (LATERAL_ACCEL + AERO_GRIP * v * v)

def corner_speed(radius):
    '''Highest steady speed on a circle of this radius, including downforce.
    Solves v^2 = R (g + k v^2) for v.'''
    g = _grip_scale * LATERAL_ACCEL
    k = _grip_scale * AERO_GRIP
    denom = 1.0 - radius * k
    if denom <= 0.05:
        return 1000.0
    return math.sqrt(radius * g / denom)

def braking_envelope(dist, v_end):
    '''Highest speed from which the car can still slow to v_end within dist metres,
    using planned deceleration a(v) = c0 + c1 v^2 (grip grows with downforce).'''
    if dist <= 0:
        return v_end
    c0 = BRAKE_PLAN * _grip_scale * LATERAL_ACCEL
    c1 = BRAKE_PLAN * _grip_scale * AERO_GRIP
    if c1 < 1e-9:
        return math.sqrt(v_end * v_end + 2.0 * c0 * dist)
    r = c0 / c1
    return math.sqrt(max(0.0, (v_end * v_end + r) * math.exp(2.0 * c1 * dist) - r))

def adapt_grip(S, v, v_curve, off):
    '''Ramp the grip estimate up while cornering near the limit without sliding,
    back off when the car slides or leaves the track.'''
    global _grip_scale, _was_off
    if off:
        if not _was_off:
            _grip_scale *= GRIP_OFFTRACK_HIT
        _was_off = True
    else:
        _was_off = False
        slide = abs(S.get('speedY', 0.0)) / max(S['speedX'], 20.0)
        if slide > SLIDE_LIMIT:
            _grip_scale *= GRIP_DOWN
        elif (slide < SLIDE_OK and v_curve < 200.0 and v > 0.92 * v_curve
              and abs(S['trackPos']) < 0.85 and abs(S['angle']) < 0.25):
            _grip_scale += GRIP_UP
    _grip_scale = max(GRIP_MIN, min(GRIP_MAX, _grip_scale))

# ---------- track memory (14): sees beyond the 200 m sensors ----------
def _cell(dist):
    b = int(dist / BIN)
    return b % _nb if _nb else b

def track_update(S):
    """Follow distFromStart, detect lap wrap-arounds and close each lap's map."""
    global _prev_dist, _max_dist, _track_len, _nb, _lap
    dist = S.get('distFromStart')
    if not isinstance(dist, float):
        return None
    if _prev_dist is not None and dist < _prev_dist - 200.0 and _prev_dist > 0.7 * _max_dist:
        _track_len = max(_track_len, _max_dist)
        _nb = int(_track_len / BIN) + 1
        _lap += 1
        finish_lap()
        _max_dist = dist
    _prev_dist = dist
    _max_dist = max(_max_dist, dist)
    return dist

def record_map(dist, radius, sgn_val, span_m):
    """Store the corner radius the sensors see (and which way it turns) for the road just ahead.
    Radius falls quickly to a tighter estimate and recovers slowly, so the map stays cautious."""
    b0 = int(dist / BIN)
    for j in range(int(span_m / BIN) + 1):
        b = b0 + j
        if _nb:
            b %= _nb
        prev = _map_R.get(b)
        if prev is None:
            _map_R[b] = radius
        elif radius < prev:
            _map_R[b] = prev + 0.5 * (radius - prev)
        else:
            _map_R[b] = prev + 0.15 * (radius - prev)
        _map_sgn[b] = 0.8 * _map_sgn.get(b, 0.0) + 0.2 * sgn_val

def penalize_map(dist):
    """The car left the track here: make the ~100 m before it slower next time."""
    b0 = int(dist / BIN)
    for j in range(20):
        b = b0 - j
        if _nb:
            b %= _nb
        if b in _map_R:
            _map_R[b] = max(MIN_RADIUS, _map_R[b] * MAP_PENALTY)

def refresh_map():
    global _map_ready
    filled = sum(1 for b in range(_nb) if b in _map_R)
    _map_ready = _nb > 40 and filled >= 0.9 * _nb
    if _map_ready:
        build_line_map()
    return filled

def finish_lap():
    filled = refresh_map()
    if SAVE_MAP and _map_ready:
        save_map()
    print('Lap %d closed | map %s (%d/%d cells)' % (_lap, 'ready' if _map_ready else 'incomplete', filled, _nb))

def save_map():
    try:
        with open(MAP_FILE, 'w') as f:
            json.dump({'len': _track_len, 'nb': _nb,
                       'R': {str(k): round(v, 1) for k, v in _map_R.items()},
                       'sgn': {str(k): round(v, 3) for k, v in _map_sgn.items()}}, f)
    except OSError:
        pass

def load_map():
    global _map_R, _map_sgn, _track_len, _nb
    try:
        with open(MAP_FILE) as f:
            m = json.load(f)
        _map_R = {int(k): float(v) for k, v in m['R'].items()}
        _map_sgn = {int(k): float(v) for k, v in m['sgn'].items()}
        _track_len = float(m['len'])
        _nb = int(m['nb'])
    except (OSError, ValueError, KeyError):
        return False
    refresh_map()
    return _map_ready

def map_radius(b):
    return _map_R.get(b % _nb, 5000.0)

def map_lim_at(dist, ahead_m):
    """Corner speed the learned map allows ahead_m metres in front of the car (m/s)."""
    b = int((dist + ahead_m) / BIN)
    r = min(map_radius(b + k) for k in (-2, -1, 0, 1, 2))
    return min(95.0, corner_speed(r))

def map_envelope(dist):
    """Highest speed from which every learned corner within MAP_AHEAD can still be taken at its
    own limit, braking at the planned deceleration."""
    best = 1000.0
    b0 = int(dist / BIN)
    off = dist - b0 * BIN
    for j in range(int(MAP_AHEAD / BIN)):
        vl = corner_speed(map_radius(b0 + j))
        if vl > 95.0:
            continue
        best = min(best, braking_envelope(max(0.0, j * BIN - off), vl))
    return best

def build_line_map():
    """Out-in-out racing line from the learned corners: outside at turn-in, inside at a slightly
    late apex, outside at the exit; corners closer than 40 m share one crossing (chicanes)."""
    global _line_map
    nb = _nb
    R = [_map_R.get(b, 5000.0) for b in range(nb)]
    sg = [_map_sgn.get(b, 0.0) for b in range(nb)]
    inc = [R[b] < CORNER_R and abs(sg[b]) > 0.08 for b in range(nb)]
    first = next((b for b in range(nb) if not inc[b]), None)
    if first is None:
        _line_map = [0.0] * nb
        return
    runs = []                       # (start, end, sign) in cells unwrapped from `first`
    i = 0
    while i < nb:
        b = (first + i) % nb
        if inc[b]:
            s = 1 if sg[b] > 0 else -1
            j = i
            while j + 1 < nb and inc[(first + j + 1) % nb] and \
                    (1 if sg[(first + j + 1) % nb] > 0 else -1) == s:
                j += 1
            if j - i >= 1:
                runs.append((first + i, first + j, s))
            i = j + 1
        else:
            i += 1
    anchors = []
    for k, (a, e, s) in enumerate(runs):
        apex = min(range(a, e + 1), key=lambda x: R[x % nb])
        apex = int(apex + LATE_APEX * (e - apex))
        near_prev = k > 0 and a - runs[k - 1][1] < 8
        near_next = k + 1 < len(runs) and runs[k + 1][0] - e < 8
        if not near_prev:
            anchors.append((a, -s * LINE_ENTRY))
        anchors.append((apex, s * LINE_APEX))
        if not near_next:
            anchors.append((e, -s * LINE_EXIT))
    if not anchors:
        _line_map = [0.0] * nb
        return
    anchors.sort()
    pos = [p for p, _ in anchors]
    off = [o for _, o in anchors]
    pos = [pos[-1] - nb] + pos + [pos[0] + nb]
    off = [off[-1]] + off + [off[0]]
    line = []
    for b in range(nb):
        p = b if b >= first else b + nb
        k = max(0, min(len(pos) - 2, bisect.bisect_right(pos, p) - 1))
        span = pos[k + 1] - pos[k]
        t = 0.0 if span <= 0 else (p - pos[k]) / span
        line.append(off[k] + t * (off[k + 1] - off[k]))
    for _ in range(3):
        line = [sum(line[(b + d) % nb] for d in range(-3, 4)) / 7.0 for b in range(nb)]
    _line_map = [max(-LINE_BOUND, min(LINE_BOUND, x)) for x in line]

def learned_line(dist, v):
    """Lateral target from the learned racing line, aimed a little ahead of the car."""
    if not _map_ready or not _line_map or dist is None:
        return None
    return _line_map[_cell(dist + LINE_PREVIEW * v)]

# ---------- geometry (6) ----------
def track_width(S):
    '''Track width from the two +-90 degree sensors, low-passed.'''
    global _width_est
    t = track_readings(S)
    if t is not None and t[0] > 0 and t[18] > 0:
        w = (t[0] + t[18]) * math.cos(min(abs(S['angle']), 1.2))
        if 5.0 < w < 40.0:
            _width_est += 0.05 * (w - _width_est)
    return _width_est

def forward_clearance(S):
    '''Longest free sight line within +-40 degrees of the nose (m).'''
    track = track_readings(S)
    if track is None:
        return 0.0
    best = 0.0
    for i in range(2, 17):
        if track[i] > best:
            best = track[i]
    return best

def plan_speed(S, v, look=0.0, dist_s=None):
    '''Returns (raw speed target m/s, friction-circle load 0..0.95, corner speed m/s).

    Curvature: on a constant-radius bend the longest sight line D from a car near the
    middle of the road satisfies D^2 ~ CHORD_K * R * W, so R ~ D^2 / (CHORD_K * W).
    Visibility: the car must always be able to slow to V_BLIND within the visible road.'''
    width = track_width(S)
    dist = forward_clearance(S)
    if dist >= 190.0:
        radius = 5000.0
        vis_dist = dist - VIS_MARGIN + SIGHT_BONUS
    else:
        radius = max(MIN_RADIUS, dist * dist / (CHORD_K * width))
        vis_dist = dist - VIS_MARGIN
    # Pure-pursuit radius to the open gap: R = Ld / (2 sin(alpha)). A corner that ends in a
    # wall has a long sight line but a big bearing to the gap, which the chord rule misses.
    alpha = max(1e-3, min(1.0, abs(look)) * math.pi / 2.0)
    radius = min(radius, max(MIN_RADIUS, max(dist, 10.0) / (2.0 * math.sin(alpha))))
    v_curve = corner_speed(radius)
    v_end = V_BLIND
    v_map = 1000.0
    if _map_ready and dist_s is not None:
        # The learned map knows what lies beyond the sensors: it sets the end-of-sight speed
        # and adds its own braking envelope for corners up to MAP_AHEAD metres away.
        v_end = max(V_BLIND, map_lim_at(dist_s, dist))
        v_map = map_envelope(dist_s)
    v_vis = braking_envelope(max(0.0, vis_dist), v_end)
    v_tgt = min(TARGET_SPEED / 3.6, v_curve, v_vis, v_map)
    # Slow down when close to an edge or pointing well away from the track direction.
    edge = abs(S['trackPos'])
    if edge > 0.85:
        v_tgt *= 1.0 - min(0.4, (edge - 0.85) * 3.0)
    ang = abs(S['angle'])
    if ang > 0.35:
        v_tgt *= max(0.5, 1.0 - (ang - 0.35))
    a_lat = lat_accel_limit(max(v, 1.0))
    rho = min(0.95, (v * v) / (radius * a_lat))
    return v_tgt, rho, v_curve, radius, dist

def smooth_target(raw):
    global _vtgt_f
    if _vtgt_f is None:
        _vtgt_f = raw
    elif raw < _vtgt_f:
        _vtgt_f += TGT_FALL_ALPHA * (raw - _vtgt_f)
    else:
        _vtgt_f += TGT_RISE_ALPHA * (raw - _vtgt_f)
    return _vtgt_f

# ---------- racing line (5) ----------
def update_line(look, learned=None):
    '''Out-in-out line: outside on corner entry, inside at the apex, outside on exit.
    Phases come from the trend of the (filtered) look-ahead magnitude.'''
    global _look_f, _mag_slow, _phase, _look_peak, _corner_sign, _line_cmd
    _look_f += LOOK_FILTER * (look - _look_f)
    mag = abs(_look_f)
    sgn = 1.0 if _look_f >= 0 else -1.0
    trend = mag - _mag_slow
    _mag_slow += 0.04 * (mag - _mag_slow)
    if mag < 0.07:
        _phase = 0
        _look_peak = 0.0
        target = 0.0
    else:
        if _phase == 0 or sgn != _corner_sign:
            _phase = 1
            _look_peak = mag
            _corner_sign = sgn
        _look_peak = max(_look_peak, mag)
        if _phase == 1 and (mag >= APEX_MAG or (_look_peak > 0.12 and trend < 0.004)):
            _phase = 2
        elif _phase == 2 and mag < 0.8 * _look_peak and trend < -0.01:
            _phase = 3
        strength = min(1.0, mag / 0.2)
        if _phase == 1:
            target = -sgn * LINE_ENTRY * strength
        elif _phase == 2:
            target = sgn * LINE_APEX * strength
        else:
            target = -sgn * LINE_EXIT * strength
    rate = LINE_RATE
    if learned is not None:
        target, rate = learned, LINE_RATE_MAP
    target = max(-LINE_BOUND, min(LINE_BOUND, target))
    _line_cmd += max(-rate, min(rate, target - _line_cmd))
    return _line_cmd

# ---------- steering (9, 10) ----------
def steer_cap(S, v, a_lat):
    '''Largest useful steering command: about the angle that produces the grip-limited
    lateral acceleration (plus some slip angle). More just scrubs speed.'''
    vv = max(v, 5.0)
    delta = STEER_CAP_MARGIN * math.atan(WHEELBASE * a_lat / (vv * vv)) + STEER_CAP_ADD
    cap = max(0.12, min(1.0, delta / STEER_LOCK))
    if abs(S['angle']) > 0.25:  # sliding / rotated: allow counter-steer
        cap = max(cap, min(1.0, abs(S['angle']) * 1.2))
    return cap

def calculate_steering(S, v, look, line):
    global _steer_prev
    gs = max(STEER_MIN_SCALE, min(1.0, (STEER_V_REF / max(v, STEER_V_REF)) ** STEER_GAIN_EXP))
    err = S['trackPos'] - line
    # Look-ahead must win over centering, or the car waits until it is already in the corner.
    centering = CENTERING_GAIN * (1.0 - 0.5 * min(1.0, abs(look)))
    steer = gs * ((S['angle'] * STEER_GAIN / math.pi) + LOOKAHEAD_GAIN * look - err * centering)
    cap = steer_cap(S, v, lat_accel_limit(v))
    steer = max(-cap, min(cap, steer))
    rate = max(STEER_RATE_MIN, min(STEER_RATE_MAX, STEER_RATE_MAX * STEER_V_REF / max(v, STEER_V_REF)))
    steer = max(_steer_prev - rate, min(_steer_prev + rate, steer))
    steer = _steer_prev + STEER_SMOOTH * (steer - _steer_prev)
    _steer_prev = steer
    return steer

# ---------- longitudinal control (2, 3, 4) ----------
def longitudinal(S, v, v_tgt, rho):
    '''Returns (throttle, brake) before ABS and traction control.'''
    global _vtgt_prev, _aff_f, _brake_prev, _thr_prev
    a_max = BRAKE_MAX_FRAC * lat_accel_limit(v)
    fc = math.sqrt(max(0.0, 1.0 - rho * rho))   # friction circle: grip left over from cornering
    err = v - v_tgt

    # Anticipate the falling speed envelope so braking starts gently and early.
    if _vtgt_prev is None:
        _vtgt_prev = v_tgt
    a_ff_raw = max(0.0, min(a_max, -(v_tgt - _vtgt_prev) / DT))
    _vtgt_prev = v_tgt
    _aff_f += 0.25 * (a_ff_raw - _aff_f)

    a_des = 0.0
    if err > -BRAKE_LEAD:
        a_des = _aff_f + BRAKE_P_GAIN * max(0.0, err)
    a_des = min(a_des, a_max * max(0.35, fc))

    if a_des > BRAKE_ON:
        brake = a_des * BRAKE_CMD_PER_MS2
    else:
        brake = 0.0
    # Slew-limit the pedal: rise gently, release quickly.
    if brake > _brake_prev:
        brake = min(brake, _brake_prev + BRAKE_RISE)
    else:
        brake = max(brake, _brake_prev - BRAKE_FALL)
    _brake_prev = brake

    if a_des > BRAKE_ON or brake > 0.02:
        accel = 0.0
    else:
        thr_ff = 0.12 + 0.0001 * v * v            # roughly what holds speed against drag
        accel = thr_ff + THR_P_GAIN * (v_tgt - v)
        accel = max(0.0, min(1.0, accel))
        accel = min(accel, max(0.3, fc))           # leave grip for cornering
        if v > 5.0:
            accel = min(accel, _thr_prev + THR_RISE)
    _thr_prev = accel
    return accel, brake

# ---------- wheels: ABS (1) and traction control (12) ----------
def wheel_speeds(S):
    '''Surface speed of each wheel in m/s (FL, FR, RL, RR), or None.'''
    w = S.get('wheelSpinVel')
    if not isinstance(w, list) or len(w) < 4:
        return None
    return [w[0] * FRONT_WHEEL_R * _front_k, w[1] * FRONT_WHEEL_R * _front_k,
            w[2] * REAR_WHEEL_R * _rear_k, w[3] * REAR_WHEEL_R * _rear_k]

def calibrate_wheels(S, v, braking, steer):
    '''Learn the effective rolling radius while coasting straight, when wheel speed
    must equal ground speed. Keeps slip ratios honest whatever the real tyre radius is.'''
    global _front_k, _rear_k
    w = S.get('wheelSpinVel')
    if not isinstance(w, list) or len(w) < 4:
        return
    if braking or v < 15.0 or abs(steer) > 0.05 or abs(S.get('speedY', 0.0)) > 3.0 or abs(S['angle']) > 0.1:
        return
    front = 0.5 * (w[0] + w[1]) * FRONT_WHEEL_R
    if front > 5.0:
        k = max(0.9, min(1.1, v / front))
        _front_k += 0.01 * (k - _front_k)
    if _thr_prev < 0.05:  # rear wheels only free-roll off the throttle
        rear = 0.5 * (w[2] + w[3]) * REAR_WHEEL_R
        if rear > 5.0:
            k = max(0.9, min(1.1, v / rear))
            _rear_k += 0.01 * (k - _rear_k)

def abs_filter(S, v, brake):
    '''Cut brake pressure when any wheel's slip ratio passes the limit.'''
    global _abs_scale
    if brake <= 0.0 or v < ABS_MIN_SPEED:
        _abs_scale = min(1.0, _abs_scale + 0.2)
        return brake
    ws = wheel_speeds(S)
    if ws is None:
        return brake
    worst = max(1.0 - s / v for s in ws)
    if worst > ABS_SLIP_HI:
        _abs_scale = max(ABS_MIN_SCALE, _abs_scale * ABS_CUT)
    elif worst < ABS_SLIP_LO:
        _abs_scale = min(1.0, _abs_scale + ABS_RECOVER)
    return brake * _abs_scale

def traction_scale(S, v):
    '''Proportional traction control for the rear-wheel-drive car: cut the throttle in
    proportion to how far the driven wheels outrun the undriven ones.'''
    if not ENABLE_TRACTION_CONTROL:
        return 1.0
    ws = wheel_speeds(S)
    if ws is None:
        return 1.0
    rear = 0.5 * (ws[2] + ws[3])
    ref = max(0.5 * (ws[0] + ws[1]), v)
    allowed = TC_ALLOW_BASE + TC_ALLOW_REL * v
    cut = max(0.0, min(TC_MAX_CUT, (rear - ref - allowed) * TC_GAIN))
    return 1.0 - cut

# ---------- gearbox (11) ----------
def shift_gears(S, braking):
    '''Shift on RPM with hysteresis: up near the limiter (torque is flat above 10k rpm),
    down only when the lower gear stays out of the limiter.'''
    global _last_shift_step
    gear = int(S.get('gear', 1))
    if gear < 1 or S['speedX'] < 10.0:
        return 1
    if _step - _last_shift_step < SHIFT_COOLDOWN:
        return min(gear, 6)
    rpm = S.get('rpm', 0.0)
    new = gear
    if gear < 6 and rpm > UPSHIFT_RPM:
        new = gear + 1
    elif gear > 1:
        after = rpm * GEAR_RATIOS[gear - 2] / GEAR_RATIOS[gear - 1]
        limit = BRAKE_DOWNSHIFT_RPM if braking else DOWNSHIFT_RPM
        if rpm < limit and after < DOWNSHIFT_MAX_AFTER:
            new = gear - 1
    if new != gear:
        _last_shift_step = _step
    return min(new, 6)

# ---------- recovery ----------
def recover_off_track(S, R):
    '''Drive back onto the track. Do not hold the brakes; reverse if facing away.'''
    angle = S['angle']
    trackpos = S['trackPos']
    speed = S['speedX']
    steer = (angle * 20.0 / math.pi) - (trackpos * 0.6)
    facing_away = abs(angle) > (math.pi / 2.0)
    if facing_away or (speed < 12 and abs(angle) > 0.7 and abs(trackpos) > 1.0):
        R['gear'] = -1
        R['steer'] = max(-1.0, min(1.0, -steer))
        R['accel'] = 0.7
        R['brake'] = 0.0
        return True
    R['gear'] = 1
    R['steer'] = max(-1.0, min(1.0, steer))
    R['brake'] = 0.0
    R['accel'] = 0.55 if speed < 45 else 0.25
    return True

def log_lap(S):
    global _last_lap_time
    lap = S.get('lastLapTime', 0.0)
    if isinstance(lap, float) and lap > 0.0 and lap != _last_lap_time:
        _last_lap_time = lap
        print('Lap time %.3f s | grip x%.2f | wheel k %.3f/%.3f' % (lap, _grip_scale, _front_k, _rear_k))

# ================= MAIN DRIVE FUNCTION =================
def drive_modular(c):
    global _step, _steer_prev, _brake_prev, _thr_prev, _abs_scale
    S, R = c.S.d, c.R.d
    _step += 1
    v = S['speedX'] / 3.6
    log_lap(S)
    dist_s = track_update(S)

    if is_off_track(S):
        if not _was_off and dist_s is not None:
            penalize_map(dist_s)
        adapt_grip(S, v, 1e9, True)
        recover_off_track(S, R)
        _steer_prev = R['steer']
        _brake_prev = 0.0
        _thr_prev = R['accel']
        _abs_scale = 1.0
        return

    look = lookahead_steer(S)
    line = update_line(look, learned_line(dist_s, v))
    v_raw, rho, v_curve, radius, clear = plan_speed(S, v, look, dist_s)
    v_tgt = smooth_target(v_raw)
    if dist_s is not None:
        record_map(dist_s, min(radius, 5000.0), _look_f, min(0.5 * clear, 60.0))

    R['steer'] = calculate_steering(S, v, 0.5 * (look + _look_f), line)
    accel, brake = longitudinal(S, v, v_tgt, rho)
    calibrate_wheels(S, v, brake > 0.0, R['steer'])
    brake = abs_filter(S, v, brake)
    R['accel'] = accel * traction_scale(S, v)
    R['brake'] = brake
    R['gear'] = shift_gears(S, brake > 0.1)
    adapt_grip(S, v, v_curve, False)
    return

# ================= MAIN LOOP =================
if __name__ == "__main__":
    C = Client(p=3001)
    if LOAD_MAP:
        print('Loaded saved track map' if load_map() else 'No usable saved track map: learning on lap 1')
    for step in range(C.maxSteps, 0, -1):
        C.get_servers_input()
        drive_modular(C)
        C.respond_to_server()
    C.shutdown()