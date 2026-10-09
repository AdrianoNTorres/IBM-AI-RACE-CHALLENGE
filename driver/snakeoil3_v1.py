#!/usr/bin/python
# TORCS racing driver for the Corkscrew: rule-based, track memory plus live sensors.
# Built on snakeoil.py by Chris X Edwards <snakeoil@xed.ch>, a Python client library for TORCS patched with the
# Simulated Car Racing server (http://scr.geccocompetitions.com/). The library part (Client, ServerState,
# DriverAction) handles the options and the UDP protocol; all driving logic is in drive_example(), called once
# per simulation step. S.d holds the sensors the server sent (angle, curLapTime, damage, distFromStart, focus,
# gear, rpm, speedX, speedY, speedZ, track, trackPos, wheelSpinVel, ...); R.d holds the reply (accel, brake,
# clutch, gear, steer, focus, meta).
# Run it with TORCS waiting for a client on port 3001:  python driver/snakeoil3_v1.py
# Each run writes one telemetry CSV to runs/.

# for Python3-based torcs python robot client
import socket
import sys
import getopt
import os
import time
from math import atan, atan2, exp, log, sin
PI= 3.14159265359
# Track sensor angles (degrees, negative = left). Sent to the server at connection
# time and used by drive_example() to know which way each track beam points.
TRACK_ANGLES= [-45, -19, -12, -7, -4, -2.5, -1.7, -1, -.5, 0, .5, 1, 1.7, 2.5, 4, 7, 12, 19, 45]

data_size = 2**17

# Initialize help messages
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
        # If you don't like the option defaults,  change them here.
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
        # == Set Up UDP Socket ==
        try:
            self.so= socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        except socket.error as emsg:
            print('Error: Could not create socket...')
            sys.exit(-1)
        # == Initialize Connection To Server ==
        self.so.settimeout(1)

        while True:
            # This string establishes track sensor angles! You can customize them.
            #a= "-90 -75 -60 -45 -30 -20 -15 -10 -5 0 5 10 15 20 30 45 60 75 90"
            # xed- Going to try something a bit more aggressive...
            a= ' '.join(str(x) for x in TRACK_ANGLES)

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
                # Keep waiting: the driver never starts or restarts TORCS itself.
                print("Waiting for server on %d............" % self.port)

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
                # Receive server data
                sockdata,addr= self.so.recvfrom(data_size)
                sockdata = sockdata.decode('utf-8')
            except socket.error as emsg:
                print('.', end=' ')
                #print "Waiting for data on %d.............." % self.port
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
                # What do I do here?
                print("Server has restarted the race on %d." % self.port)
                # I haven't actually caught the server doing this.
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
            print("Error sending to server: %s" % emsg)
            sys.exit(-1)
        if self.debug: print(self.R.fancyout())
        # Or use this for plain output:
        #if self.debug: print self.R

    def shutdown(self):
        if not self.so: return
        print(("Race terminated or %d steps elapsed. Shutting down %d."
               % (self.maxSteps,self.port)))
        self.so.close()
        self.so = None
        #sys.exit() # No need for this really.

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

    def fancyout(self):
        '''Specialty output for useful ServerState monitoring.'''
        out= str()
        sensors= [ # Select the ones you want in the order you want them.
        #'curLapTime',
        #'lastLapTime',
        'stucktimer',
        #'damage',
        #'focus',
        'fuel',
        #'gear',
        'distRaced',
        'distFromStart',
        #'racePos',
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

        #for k in sorted(self.d): # Use this to get all sensors.
        for k in sensors:
            if k not in self.d and k not in ('skid', 'slip'): continue # Not sent by this server.
            if type(self.d.get(k)) is list: # Handle list type data.
                if k == 'track': # Nice display for track sensors.
                    strout= str()
                 #  for tsensor in self.d['track']:
                 #      if   tsensor >180: oc= '|'
                 #      elif tsensor > 80: oc= ';'
                 #      elif tsensor > 60: oc= ','
                 #      elif tsensor > 39: oc= '.'
                 #      #elif tsensor > 13: oc= chr(int(tsensor)+65-13)
                 #      elif tsensor > 13: oc= chr(int(tsensor)+97-13)
                 #      elif tsensor >  3: oc= chr(int(tsensor)+48-3)
                 #      else: oc= '_'
                 #      strout+= oc
                 #  strout= ' -> '+strout[:9] +' ' + strout[9] + ' ' + strout[10:]+' <-'
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
                          "---  ", ".__  ", "-._  ", "'-.  ", "'\\.  ", "'|.  ",
                          "  |  ", "  .|'", "  ./'", "  .-'", "  _.-", "  __.",
                          "  ---", "  --.", "  -._", "  -..", "  '\\.", "  '|."  ]
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
       # "d" is for data dictionary.
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

# == Misc Utility Functions
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

def drive_example(c):
    '''The driver: called once per simulation step. Reads the sensors in c.S.d and
    writes the action into c.R.d. State kept between steps lives on c.'''
    S,R= c.S.d,c.R.d
    target_speed=300  # km/h the throttle aims for on straights; above the car's top speed, so it never caps (the braking plan sets corner speeds).
    corner_speed=78   # km/h the car must be able to slow to by the end of the visible road (sensor braking plan; 79 leaves the track at the hairpin / flick).
    brake_decel=14.0  # m/s^2 of mechanical deceleration the sensor braking plan assumes.
    brake_aero=.0065  # extra planned deceleration per (m/s)^2 of speed (drag and downforce): brake_decel*load + brake_aero*v^2.
    brake_max=30      # m/s^2: most deceleration the plan assumes ...
    brake_max_hi=34   # m/s^2: ... or this much where that only lifts the allowed speed up to brake_hi_v (at full pedal the car slows at 39-43 m/s^2) ...
    brake_hi_v=235    # km/h: ... above this allowed speed the plan stays on brake_max (the flick approach relies on that plan's early dips) ...
    brake_hi_car=245  # km/h: ... unless the car itself is above this speed: then brake_max_hi counts everywhere (999 = off).
    brake_load_min=.5 # brake_decel is scaled by the tyre load read from the vertical acceleration (crests), never below this share at low speed ...
    brake_load_fast=.8  # ... nor below this share at speed (a crest is short against a long braking distance; 1.0 leaves the track at the flick) ...
    brake_load_v0=150   # km/h: ... the floor is brake_load_min up to this speed ...
    brake_load_vw=50    # km/h: ... rising linearly to brake_load_fast over this much more speed (full from 200).
    brake_margin=15   # m of visible road kept in reserve.
    brake_gain=.05    # brake pedal per km/h over the allowed speed (20 km/h over = full brake).
    lookahead_gain=2.0  # sensor steering: steer per radian of bearing toward the open road ahead.
    line_offset=.47     # sensor steering's racing line: trackPos aimed for, outside before/after a bend, inside near the apex (0 = centre).
    line_gain=.50       # steer per unit of trackPos away from the racing line (only in bends).
    line_aim_off=1      # deg: a bend starts when the bearing passes 2 deg and lasts until it falls below this.
    line_apex=.45       # extra trackPos aimed for on the inside near the apex (on top of line_offset) ...
    apex_steer=.5       # ... in full while the smoothed |steer| is below this ...
    apex_steer_fade=.25 # ... and fading out over this much more |steer| (none from 0.75: hairpin, flick).
    apex_lp=.9          # ... |steer| low-passed per step for that fade (on the raw value the target and the steering chase each other).
    line_ki=1.5         # inside line integral: steer added per second per unit of trackPos short of the inside target ...
    line_imax=.4        # ... at most this much steer ...
    line_isteer=.4      # ... in full while |steer| is below this ...
    line_ifade=.25      # ... fading out over this much more |steer| (none from 0.65: hairpin, flick) ...
    setup_dist=160      # m: corner set-up: with less road than this visible along the track direction ...
    setup_beam=2        # deg: ... the beams this far either side of it ...
    setup_min=3         # m: ... differing by more than this tell the coming bend's side early.
    setup_offset=.85    # trackPos aimed for on the outside during the set-up ...
    setup_road=85       # m: ... while more road than this is visible along the track direction (held closer to the bend, the outward yaw brings the turn-in forward).
    setup_steer=.045    # no set-up starts while |steer| is above this (the car is still in a bend); once started it is held.
    setup_pull=.15      # most steer the set-up pull may add (uncapped, the held set-up left the track at the flick).
    line_idecay=.85     # ... and outside the inside half of a bend it fades by this share per step.
    rel_start=7         # m: exit release: once the road along the track has grown this much past the bend's shortest ...
    rel_width=2         # m: ... the inside target is released over this much more road ...
    rel_share=.8        # ... by this share (the car runs out toward the exit; the inside integral is kept).
    run_head=10         # km/h: exit run-out: once the plan allows this much more than the car's speed on the inside half of a bend ...
    run_width=15        # km/h: ... the inside target is let go over this much more headroom (all of it from run_head + run_width) ...
    run_lp=.8           # ... smoothed: share of the previous step's value kept (the allowed speed jumps step to step).
    max_steer_step=.2   # most the steering may change in one step (~21 ms).
    steer_cap=.62       # most |steer| at speed (beyond it the front tyres are past their grip and only scrub) ...
    steer_cap_v0=95     # km/h: ... no cap up to this speed (hairpin and the flick's arcs need full lock) ...
    steer_cap_vw=10     # km/h: ... full cap from steer_cap_v0 + steer_cap_vw (linear between).
    upshift_rpm=18600   # shift up when the driven wheels' rpm (axle_rpm, not the engine rpm) passes this, just under the limiter (18,700).
    downshift_rpm=15000 # braking or coasting, shift down only if the lower gear would land below this (16,000 and up: the earlier gear turns the car in and spends edge margin at 446 m and the 2,700 m exit).
    # Gear for the exit. The engine's torque is flat from 9,000 to 18,000 rpm, so the thrust at the wheels goes with
    # the gear ratio: the lower gear always pulls harder. On the throttle the car shifts down as soon as the lower gear
    # would land below drive_ds_rpm (the engine's rpm reading, 4.7 % high: 19,000 read = 18,150), not sooner than
    # drive_ds_wait steps after the last shift. Judged on the driven wheels' rpm instead, the gears hunt on wheelspin.
    drive_ds_rpm=19000  # on the throttle, shift down as soon as the lower gear would land below this (0 or downshift_rpm = off).
    # Gear into the bend. An earlier downshift under braking turns the car in harder (engine braking on the rear
    # wheels): a shorter path, paid for at the inside edge. So it is used by place, only where the margin does not move.
    entry_ds_rpm=19000  # braking or coasting inside entry_ds_zones, shift down as soon as the lower gear would land below this (rpm reading; downshift_rpm or less = off).
    entry_ds_zones= ((340, 385), (1500, 1530), (2320, 2420), (2950, 3000))   # from m, to m: the upper gears of the braking for 446 m, the last gear of 1,528 m, the flick approach, 2,988 m.
    entry_ds2_rpm=17000 # the same inside entry_ds2_zones at a lower threshold (19,000 there puts the car at 0.95 of the inside edge with the stored speed read 10 m late).
    entry_ds2_zones= ((700, 760), (1430, 1500))   # from m, to m: braking for 770 m and the upper gears of 1,528 m.
    drive_ds_wait=5     # steps since the last shift before the on-throttle downshift (the rpm reading dips while the clutch closes).
    brake_ds_rpm=17500  # while braking more than brake_ds_over above the allowed speed, shift down as soon as the lower gear would land below this instead (engine braking on the rear wheels; under the 18,700 limiter) ...
    brake_ds_over=20    # km/h: ... the excess at which the pedal is at its limit (the flick approach; the other braking zones keep downshift_rpm).
    upshift_hold=15     # steps (~0.3 s) after an upshift with no downshift unless braking (the rpm dips while the clutch engages: 2-3-2-3 hunting).
    lowest_running_gear=2  # never shift down below this while moving (1st is only for the start and for full lock).
    lock_gear_on=.96    # first gear at full lock: in 2nd, above this |steer| and below lock_gear_v the car shifts down to 1st (engine braking on the rear wheels turns the car in; the fronts are saturated) ...
    lock_gear_v=105     # km/h: ... only below this speed (1st reaches the 18,700 limiter at 127 km/h) ...
    lock_gear_off=.72   # ... and back up to 2nd once |steer| falls below this (the exit is driven in 2nd).
    ahead_angle_max=3   # deg: also measure the road ahead along the track direction when the car points within this of it.
    turn_grip=8.0       # m/s^2 of sideways acceleration assumed when curving onto a beam (0 = plan from the road ahead only).
    turn_steer_max=.78  # curving onto beams is not planned above this |steer| (near full lock).
    turn_steer_fade=.17 # its credit fades out linearly over this much |steer| below turn_steer_max (full credit up to 0.61).
    fade_lp=.9          # that |steer| is smoothed: share of the previous smoothed value kept per step (0 = raw steer).
    turn_grip_aero=1.5e-4  # turn_grip rises by this share per (m/s)^2 of speed (downforce): +12% at 100 km/h, +46% at 200.
    grip_boost=.3       # turn_grip is raised by this share while the smoothed |steer| is below boost_steer ...
    boost_steer=.2      # ... (light steering = grip to spare: steady medium bends ride the plan at |steer| 0.15-0.3) ...
    boost_fade=.1       # ... fading out over this much more |steer| (none from 0.3).
    slip_ref=.3         # sharpness plan: the beam angles are measured from the nose turned by this share of the slip angle (atan(speedY/speedX)) toward the direction of travel (0 = from the nose, 1 = from the direction of travel).
    tc_slip=4.5         # m/s the rear wheels may outrun the fronts before traction control cuts.
    tc_gain=.3          # throttle cut per m/s of rear over-speed beyond the limit (soft: the tyre force still rises with slip past its peak; .1 runs to 0.98 of the edge, 0 leaves the track).
    tc_hold=.8          # share of last step's traction-control cut still applied this step (fades the cut out).
    tc_slip_straight=5.0  # m/s of extra over-speed allowed when the car goes straight (the rears carry no sideways load).
    tc_slip_steer=.7    # |steer| at which that extra is gone (it falls linearly from steer 0 to here).
    tc_vref=110         # km/h: slip ratio: the over-speed limit above (tc_slip + the straight extra) holds at this speed and scales with speed/tc_vref (the tyre force depends on over-speed / speed, not on m/s); launch_slip is added after.
    tc_slip_slide=20    # km/h of sideways speed at which that extra is gone too (no extra while the car slides).
    lock_steer=.6       # above this |steer| the throttle is limited, falling to lock_throttle at full lock.
    lock_throttle=.2    # throttle allowed at full lock when the car would reach the outside edge in lock_tte_far seconds at its present drift.
    lock_tte_near=.9    # s: time to the outside edge (room / outward drift rate) at or below which no throttle is allowed at full lock ...
    lock_tte_far=1.7    # s: ... rising linearly through lock_throttle at this time to the edge ...
    lock_throttle_max=.5   # ... up to this much once the drift has stopped or the edge is far (hairpin exit, the flick's right arc).
    lift_pct=3.5        # % of speed over the allowed speed where the car only lifts (throttle 0, stored throttle kept) before braking (4.5 leaves the track at the flick).
    lift_v0=86          # km/h: no lift band below this speed (slow corners brake at once) ...
    lift_vw=57          # km/h: ... full band from lift_v0 + lift_vw (linear between).
    touch_brake=.15     # a brake touch lighter than this pedal keeps touch_keep of the stored throttle ...
    touch_keep=.7       # ... (instead of zeroing it), so the throttle resumes there after the touch.
    dab_n=2             # brake dab: for the first this many steps of a brake application, whatever the pedal, dab_keep of the stored throttle is kept per step (0 = off) ...
    dab_keep=.7         # ... this share ...
    dab_steer=.15       # ... only while the smoothed |steer| is below this (not in a bend) ...
    dab_v=230           # km/h: ... and only below this speed (the start kink is at 219-229 km/h; on the flick approach, 245-275, the brake touches set the arc's entry speed).
    thr_zero=1.0        # throttle floor: while the car is under the allowed speed the stored throttle is at least this share of the engine's zero-torque throttle (0 = off; 1.6 leaves the track).
    abs_ratio=.8        # ABS: the brake is cut once the slowest wheel turns below this share of the car speed ...
    abs_cut=.5          # ... to this share of the pedal.
    launch_v=160        # km/h: standing start: until the car first reaches this speed ... (the rear wheels hook up by themselves at 142-147 km/h; a cut before that drops the engine out of its power band)
    launch_slip=25      # m/s: ... this much more rear over-speed is allowed before traction control cuts (in practice no cut).
    exit_steer=.3       # below exit_v after the launch, launch_slip also applies while the car runs straight (out of the hairpin and the Corkscrew), full at steer 0, none from this |steer| ...
    exit_vy=6           # ... and none from this sideways speed (km/h; no extra while the car slides).
    exit_v=130          # km/h: the speed below which the straight-exit allowance above applies.
    clutch_slip=.667    # most clutch pedal while accelerating (2/3: the most at which TORCS still passes the full engine torque, min(3*(1 - pedal), 1)) ...
    clutch_top=17000    # ... slipped in every gear while the rpm of the driven wheels (rear wheel speed * gear ratio * final drive) is below this ...
    clutch_k=60         # ... easing off toward it: pedal = 1 - (clutch_k/(clutch_top - wheel rpm + clutch_k))^(1/4) (rpm; larger = closed sooner).
    shift_steps=3       # for this many steps from an upshift (the 0.05 s shift time = 2.5 steps) the clutch pedal is held at clutch_slip while accelerating (0 = off: TORCS then opens the clutch itself and caps the throttle at 0.1).
    sb_a=12             # S-bend look with the focus sensors (5 extra beams 1 deg apart, aimed by the client, one reading per second): asked for when the longest track beam is at least this many deg off the nose and its outer neighbour is under half of it (a kink ahead) ...
    sb_v=200            # km/h: ... above this speed ...
    sb_steer=.3         # ... while the smoothed |steer| is below this; the look covers the 4 deg on the nose side of that beam.
    sb_fall=3           # m: the look shows a slow corner behind the kink when its ray nearest the nose is this much longer than the one at the beam (the far edge faces the car: the road turns back; on this track only the flick approach) ...
    sb_x=25             # m: ... then the allowed speed is at most the braking distance to corner_speed over the look's longest ray less this, counted down by the distance driven ...
    sb_hold=12          # ... for this many steps (0 = looks only).
    # Corner table (track memory): km/h added to the sensor braking plan's allowed speed while distFromStart is
    # inside a row. The sensors still make the plan; the table only says which corner this is. A row starts before the
    # braking point and ends where the plan stops binding on the exit. Used only outside plan_mem (inside it the stored
    # speed is the plan), so the bends inside plan_mem have no row.
    corner_table= (      # from m, to m, km/h
        (1835, 1990, 130),   # 1,931 m left-hander (+135: the car can ride the inside kerb, and a run on it at 273 km/h or more ends at 1,943 m; +140: every run).
        (2585, 2600, 36),   # downhill out of the Corkscrew, up to where plan_mem starts (the car lifted on the sensor plan there).
        (2880, 3050, 60),   # 2,988 m right-hander (+65: 0.85 of the edge at the exit, 3,053 m).
        (3175, 3275, 2),   # hairpin, added to the line's speed cap, which binds there (+3 and up: 0.78-0.93 of the edge at the exit).
    )
    # Planned line (track memory): a whole-lap racing line computed offline from the track's geometry by
    # tools/raceline.py (the segments of corkscrew.xml rebuilt as TORCS builds them, then a curvature-smoothing line
    # inside a limit of |trackPos| set per stretch). One row every plan_ds metres of distFromStart: the line's trackPos
    # (plan_pos), its curvature (plan_curv, 1/km, + = left) and the speed the line allows there (plan_v, km/h, from
    # sideways grip and the braking distance to the corners ahead). Inside plan_zones the steering follows the line: the
    # live trackPos and the car's direction of travel are held to the line's position and direction, with the line's
    # curvature as feed-forward. Outside the zones (the start and the finish straight) the sensor steering drives.
    # The raceline.py commands behind each stretch of the tables are in docs/CHANGELOG.md (v1.11, v1.14-v1.16, v1.25,
    # v1.26, v1.30, v1.32, v1.33).
    plan_zones= ((60, 3330),)   # from m, to m: where the planned line steers (the whole lap but the start and the finish straight).
    plan_ramp=30        # m over which the planned steering fades in and out at a zone's ends.
    plan_kp=.45         # steer per unit of trackPos away from the line (.7: slower; .4 with plan_kh 3.7: 0.98 of the edge at 439 m with plan_vd 5).
    plan_kh=4.3         # steer per radian between the car's direction of travel and the line's direction.
    plan_slipmax=5      # deg: most slip angle (atan(speedY/speedX)) counted in the direction of travel; beyond it the nose counts, so a slide is still caught by counter-steer (no limit: runs leave the track; 0: the car runs 0.3 wide of the line in every bend).
    # No counter-steer while the car is still outside its line, at the Corkscrew's left flick. Braking into the flick
    # the car slides with its nose 10-21 deg inside its direction of travel; beyond plan_slipmax the nose counts, so
    # the heading term counter-steered at full gain while the car was 0.2-0.3 outside its line, pushing it further out.
    # Inside plan_gz, below plan_gv0 + plan_gvw km/h, and only while the car is on the outer side of the line (by
    # plan_gw of trackPos for the full effect), the heading and position gains are scaled down to plan_khlo / plan_kplo
    # of their value. On the line or inside it the gains are whole, so the car is caught at the apex; the feed-forward
    # is never scaled. Scaled on both sides of the line, the car cuts inside the apexes and leaves the track.
    plan_gz= ((2400, 2470),)   # from m, to m: the Corkscrew's left flick, braking to apex.
    plan_gv0=100        # km/h: ... the scaled gains act in full up to this speed ...
    plan_gvw=60         # km/h: ... and fade to the full gains over this much more
    plan_gw=.05         # trackPos outside the line for the full effect.
    plan_khlo=.5        # share of plan_kh there (1 = off).
    plan_kplo=.6        # share of plan_kp there
    plan_ff=12          # feed-forward: steer per 1/m of the line's curvature at low speed ...
    plan_ffv=6e-4       # ... rising by this share per (m/s)^2 (the fronts slip more at speed; higher, the car cuts inside the line at the fast apexes).
    plan_la=.15         # s: the feed-forward reads the curvature this far ahead.
    plan_vs=1.02        # share of the line's speed the braking plan may reach (1.06: runs leave the track at 2,803 m). The plan_v entries at 620-860 m and 2,250-2,460 m were divided by 1.02 when this went from 1.0 to 1.02, so those stretches kept their speed.
    # Braking plan from track memory. Inside plan_mem the allowed speed IS the table's speed (plan_v * plan_vs): the
    # sensor plan and the corner table are not used there. The table gives a speed by distance, never a pedal: brake,
    # lift band, throttle, ABS and traction control still react to the car's live speed against it, and the steering
    # follows the line with live feedback.
    # How the tables are drawn (limits as shares of the half-width):
    # - base limit 0.65; the ways into and out of 446 m, 1,042 m, 1,528 m and 1,931 m and the 770 m exit at 0.85; the
    #   hairpin's at 0.78;
    # - the 770 m entry drawn at 1.10, outside the edge, because the car runs 0.2-0.3 inside its line while it brakes
    #   there (it reaches 0.84);
    # - apexes held tighter where the car cuts inside its line: 770 m 0.57, 1,528 m 0.61, 1,931 m 0.38 (at 0.45 the
    #   car can ride the inside kerb, and a run on it at 273 km/h or more ends at 1,943 m); 1,042 m, 2,700 m and
    #   2,988 m 0.5;
    # - the Corkscrew: 0.3 on the way to the crest, 0.5 through the kink and at the right-hand apex (the wall stands at
    #   the track's edge), the left apex drawn at 0.95 because the car slides 0.1-0.3 wide of its line there;
    # - the line's speed scaled per bend toward what the car carries: 770 m x0.95, 1,042 m x1.03, 1,528 m x1.07 x0.98
    #   with the braking into it x0.85. The wide line at its own speed leaves the track at the 770 m exit.
    # Left on min(sensor plan, plan_v) + corner row: the 1,931 m left-hander (on the stored speed the car cuts to the
    # inside edge), the flick / Corkscrew (the sensor plan is the ceiling that keeps the car off the wall), the 2,988 m
    # right-hander and the hairpin (with the stored speed read late the car leaves the track at its exit).
    plan_mem= ((90, 1750), (2600, 2850))   # from m, to m: where the stored speed is the braking plan (start kink, 446 m, 770 m, 1,042 m, 1,528 m; 2,700 m)
    plan_vd=0           # m: the stored speed is read this far ahead of the car (0; the braking-plan check moves it by +-5 / +-10 m).
    # Line-error guard: a live ceiling on the planned speed. The stored speed assumes the car is on the line; when it
    # is not (the Corkscrew's left apex missed: full throttle toward the wall), the allowed speed is cut by plan_ek per
    # unit of trackPos the car is off plan_pos beyond plan_e0, at most plan_emax. On the standard lap the guard acts
    # only at the Corkscrew.
    plan_ek=.5          # share of the allowed speed taken off per unit of trackPos off the line beyond plan_e0 (0 = off; 2 or more: the car brakes at full lock toward the wall).
    plan_e0=.4          # trackPos off the line with no effect.
    plan_emax=.5        # most taken off
    # Exit guard. After each apex of plan_mem the stored speed rises far faster than the car can follow, so nothing
    # live limits the exit: the car is at full throttle with the steering at its cap, and 2-3 km/h more at the apex
    # puts it 0.2 of trackPos wider 60 m later. The guard acts on the throttle: for every unit of trackPos the car is
    # outside the planned line (on the side away from the steering) beyond plan_x0, read plan_xt s ahead on its
    # present rate, plan_xk of the throttle is taken off. It does nothing on the standard lap; it holds the exits when
    # the stored speed is read early or late. Only inside plan_mem.
    plan_xk=5           # share of the throttle taken off per unit of trackPos outside the planned line beyond plan_x0 (0 = off)
    plan_x0=.45         # trackPos outside the line with no effect (0.4 or less: the guard acts on the standard lap).
    plan_xt=.2          # s: the error is read this far ahead on its present rate (0: too late to hold the exit).
    # Throttle from the stored speed's slope. Without it the car comes into every bend of plan_mem at the top of the
    # lift band, coasts until it is under the plan, and only then starts the throttle from its floor, by which time the
    # stored speed is rising again. The stored speed's slope is known, so the throttle that makes the car slow down as
    # the plan does is known before the car is under it: (plan's acceleration v*dv/ds read plan_tla s ahead + coasting
    # deceleration 5.75 + 0.00161*v^2) * plan_tk, at most plan_tmax. Under the plan it is a floor for the stored
    # throttle; inside the lift band it is sent in place of 0, faded to none at the top of the band. The brake, the
    # lift band, the full-lock limit, traction control and the exit guard still act on it. Only inside plan_tz (not at
    # 1,042 m or 2,700 m), and only with the exit guard: without it the exits leave the track when the stored speed is
    # read early.
    plan_tk=.05         # throttle per m/s^2 the stored speed asks for beyond coasting (0 = off).
    plan_tla=.1         # s ahead over which the stored speed's slope is read
    plan_tmax=.6        # most throttle from it.
    plan_tz= ((90, 980), (1150, 1750))   # from m, to m: where it acts (start kink, 446 m, 770 m; 1,528 m)
    # Track elevation in the track memory (tools/elevation.py rebuilds the height of the centre line from the track
    # file). The "crest" at 2,351 m is a compression at 2,335-2,358 m (the car bottoms and is damaged there from about
    # 255 km/h) and the crest behind it at 2,365-2,385 m (tyre load -38 %). plan_v is capped through it at 245 km/h at
    # 2,340 m, 236 at 2,350 m and 228 at 2,360 m, so the braking runs through the compression, where the grip is
    # best; 260 at 2,340 m damages the car on every run.
    plan_ds= 10  # m between rows of the three tables below.
    plan_pos= (0.003, 0.123, 0.145, 0.072, -0.064, -0.19, -0.303, -0.401, -0.484, -0.548, -0.589, -0.603, -0.588, -0.541, -0.458, -0.339, -0.179, 0.022, 0.268, 0.519, 0.64, 0.622, 0.459, 0.211, -0, -0.214, -0.365, -0.488, -0.586, -0.664, -0.725, -0.771, -0.805, -0.827, -0.841, -0.848, -0.85, -0.846, -0.799, -0.656, -0.351, 0.134, 0.465, 0.611, 0.649, 0.63, 0.565, 0.467, 0.577, 0.649, 0.591, 0.449, 0.24, -0.03, -0.374, -0.661, -0.802, -0.847, -0.849, -0.849, -0.787, -0.639, -0.435, -0.195, 0.062, 0.321, 0.565, 0.778, 0.946, 1.058, 1.099, 1.033, 0.829, 0.449, -0.026, -0.339, -0.507, -0.568, -0.542, -0.411, -0.145, 0.265, 0.57, 0.744, 0.826, 0.849, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.839, 0.801, 0.715, 0.563, 0.326, 0.012, -0.227, -0.384, -0.472, -0.5, -0.468, -0.357, -0.126, 0.243, 0.522, 0.704, 0.807, 0.846, 0.845, 0.815, 0.754, 0.664, 0.545, 0.395, 0.215, 0.007, -0.183, -0.338, -0.462, -0.553, -0.614, -0.646, -0.647, -0.617, -0.553, -0.517, -0.485, -0.475, -0.484, -0.507, -0.541, -0.583, -0.631, -0.681, -0.73, -0.775, -0.812, -0.838, -0.85, -0.844, -0.8, -0.688, -0.479, -0.153, 0.136, 0.35, 0.498, 0.586, 0.61, 0.577, 0.509, 0.417, 0.304, 0.172, 0.017, -0.167, -0.388, -0.61, -0.748, -0.819, -0.847, -0.85, -0.845, -0.833, -0.815, -0.793, -0.769, -0.742, -0.715, -0.689, -0.667, -0.65, -0.638, -0.633, -0.639, -0.657, -0.689, -0.727, -0.765, -0.799, -0.826, -0.844, -0.85, -0.837, -0.773, -0.619, -0.339, 0.092, 0.347, 0.349, 0.097, -0.174, -0.318, -0.404, -0.466, -0.482, -0.436, -0.322, -0.238, -0.26, -0.364, -0.424, -0.43, -0.395, -0.356, -0.318, -0.285, -0.262, -0.252, -0.26, -0.286, -0.304, -0.307, -0.301, -0.291, -0.271, -0.217, -0.123, 0.007, 0.127, 0.214, 0.271, 0.298, 0.295, 0.281, 0.258, 0.217, 0.149, 0.045, -0.106, -0.315, -0.461, -0.5, -0.484, -0.48, -0.5, -0.47, -0.31, 0.083, 0.583, 0.873, 0.95, 0.664, -0.064, -0.49, -0.424, -0.153, 0.25, 0.556, 0.648, 0.597, 0.436, 0.278, 0.208, 0.26, 0.444, 0.591, 0.65, 0.584, 0.402, 0.332, 0.399, 0.469, 0.495, 0.5, 0.499, 0.499, 0.5, 0.498, 0.483, 0.439, 0.353, 0.207, -0.013, -0.279, -0.445, -0.514, -0.503, -0.425, -0.298, -0.138, 0.041, 0.221, 0.387, 0.523, 0.615, 0.65, 0.611, 0.475, 0.217, -0.111, -0.328, -0.449, -0.497, -0.489, -0.418, -0.248, 0.053, 0.366, 0.547, 0.631, 0.65, 0.629, 0.578, 0.501, 0.404, 0.29, 0.166, 0.035, -0.098, -0.229, -0.355, -0.472, -0.575, -0.663, -0.73, -0.771, -0.778, -0.711, -0.46, 0.111, 0.554, 0.647, 0.422, -0.194, -0.62, -0.762, -0.78, -0.779, -0.776, -0.77, -0.763, -0.754, -0.743, -0.731, -0.718, -0.705, -0.69, -0.675, -0.661, -0.65, -0.642, -0.636, -0.628, -0.612, -0.584, -0.544, -0.496, -0.448, -0.412, -0.401, -0.408, -0.407, -0.366, -0.272, -0.134)
    plan_curv= (0.77, 0.6, 0.71, 0.81, 0.8, 0.77, 0.81, 0.95, 1.15, 1.38, 1.59, 1.77, 1.94, 2.09, 2.22, 2.35, 2.48, 2.62, 2.77, 2.9, 2.97, 2.89, 2.7, 2.48, 2.24, 1.93, 1.7, 1.47, 1.22, 0.99, 0.89, 0.77, 0.65, 0.53, 0.41, 0.29, 0.18, 2.54, 5.87, 9.2, 12.65, 16.33, 20.2, 23.98, 27.31, 26.95, 26.45, 26.78, 27.84, 28.5, 25.36, 21.85, 18.38, 15.02, 11.79, 8.7, 5.67, 2.58, -0.17, -1.92, -2.33, -2.69, -3.08, -3.45, -3.84, -4.3, -4.84, -5.4, -5.86, -6.16, -6.58, -8.29, -9.88, -11.35, -12.94, -14.7, -16.52, -18, -16.62, -14.47, -12.19, -9.87, -7.67, -5.56, -3.45, -1.29, -0.02, 0, 0, 0, 0, 0, 0, 0, -0.57, -1.69, -2.81, -3.94, -5.09, -6.29, -7.62, -9.06, -10.44, -11.59, -12.42, -11.89, -10.82, -9.32, -7.47, -5.67, -4.76, -3.69, -2.45, -1.78, -1.77, -1.76, -1.77, -1.78, -1.8, -1.83, -1.86, -1.9, -1.93, -1.98, -2.03, -2.07, -2.08, -1.99, -1.8, -1.6, -1.51, -1.29, -1.08, -0.88, -0.68, -0.49, -0.31, -0.14, 0.05, 0.26, 0.48, 0.67, 0.83, 1, 2.26, 4.06, 5.84, 7.6, 9.35, 11.14, 13.02, 14.96, 16.78, 18.12, 16.77, 15.09, 13.45, 11.91, 10.48, 9.12, 7.8, 6.49, 5.21, 3.95, 2.7, 1.41, 0.46, 0.39, 0.34, 0.26, 0.18, 0.11, 0.03, -0.09, -0.21, -0.29, -0.33, -0.42, -0.6, -0.8, -0.8, -0.38, -0.03, 0.25, 0.45, 0.57, 0.66, 1.02, 3.11, 5.25, 7.41, 9.75, 12.29, 14.86, 14.67, 11.39, 7.52, 3.43, 1.13, 2.77, 3.79, 4.2, 4.19, 4, 3.77, 3.52, 3.27, 3.01, 2.76, 2.51, 2.28, 2.04, 1.78, 1.54, 1.34, 1.13, 0.87, 0.55, 0.22, 0.2, 0.22, 0.24, 0.24, 0.23, 0.23, 0.24, 0.25, 0.26, -0.03, -0.54, -1.06, -1.61, -2.19, -2.8, -3.48, -4.18, -4.82, -5.15, -3.28, -1.16, 2.27, 7.71, 13.54, 20.17, 27.79, 35.75, 39.74, 21.4, -2.23, -24.12, -26.48, -21.7, -17.04, -12.65, -8.43, -6.63, -5.08, -3.37, -1.6, 0.19, 1.97, 3.65, 5.12, 6.35, 7.57, 8.86, 10.22, 11.59, 12.84, 13.84, 14.12, 14.05, 13.72, 12.95, 11.89, 10.8, 9.73, 8.7, 7.71, 6.75, 5.81, 4.87, 3.92, 2.97, 2.01, 1.05, 0.1, -0.84, -1.76, -2.65, -3.48, -4.28, -5.77, -7.31, -8.93, -10.66, -12.42, -14.07, -15.46, -15, -13.17, -11.31, -9.45, -7.62, -5.82, -3.97, -2.18, -1.83, -1.55, -1.24, -0.94, -0.65, -0.38, -0.14, 0.1, 0.34, 0.56, 0.75, 0.96, 1.23, 1.57, 1.92, 4.25, 10.91, 18.3, 26.84, 36.47, 40.93, 32.52, 24.05, 15.81, 7.57, 0.66, 0.13, 0.12, 0.12, 0.11, 0.09, 0.07, 0.06, 0.05, 0.05, 0.02, -0.06, -0.16, -0.21, -0.13, 0.11, 0.48, 0.75, 0.74, 0.5, 0.02, -0.78, -1.5, -1.17, 0.49, 2.44, 3.25, 2.66, 1.5)
    plan_v= (360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 354.0, 342.0, 329.0, 315.0, 301.0, 286.0, 270.0, 254.0, 236.0, 216.0, 195.0, 175.0, 157.0, 140.0, 126.0, 114.0, 105.0, 100.0, 102, 104, 102, 99.0, 98.0, 107.0, 119.0, 138.0, 166.0, 210, 244.0, 303.0, 360, 360.0, 350.0, 339, 330, 302.0, 291.6, 282.1, 269.6, 258.2, 247.8, 235.5, 223.2, 208, 192.9, 177.8, 165.5, 153.2, 142.8, 135.0, 131.2, 142.5, 164.3, 195.7, 217.5, 247.0, 289.8, 342, 342, 342, 360, 360, 360, 360, 356, 343, 330, 317, 303, 289, 276, 263, 250, 238, 228, 219, 213, 209, 215, 225, 243, 271, 313, 333, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 355.0, 342.0, 329.0, 315.0, 301.0, 286.0, 270.0, 250.9, 236.2, 221.5, 207.8, 193.1, 180.3, 168.6, 158.8, 150.9, 144.1, 156.8, 173.5, 197, 218.5, 233.2, 249.9, 256.8, 277.3, 309.7, 358.0, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 352.0, 339.0, 326.0, 312.0, 298.0, 283.0, 267.0, 250.0, 232.0, 214.0, 196.0, 180.0, 166.0, 157.0, 170.0, 213.0, 263.0, 356.0, 360.0, 359.0, 353.0, 350.0, 352.0, 359.0, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 351, 338.2, 325.5, 333.1, 318.5, 302.8, 287.2, 270.5, 252.8, 240.2, 231.4, 223.5, 217.6, 199, 178.4, 157.8, 136.3, 117.6, 101, 87.3, 76.5, 70.6, 111, 105, 91, 100, 117, 146, 201, 254, 281, 320, 322, 310, 295, 280, 266, 252, 240, 228, 215, 203, 192, 184, 179, 177, 178, 183, 197, 209, 219, 231, 244, 259, 277, 299, 326, 360, 355, 345, 332, 319, 305, 290, 276, 261, 245, 230, 215, 199, 184, 172, 163, 158, 167, 193, 214, 234, 261, 299, 355, 360, 360, 360, 360, 349, 337, 323, 309, 295, 279, 263, 246, 227, 207, 186, 164, 143, 124, 106, 90, 79, 78, 90, 111, 158, 264, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360)
    prev_steer= R['steer']  # steering sent last step (R persists between steps).
    R['accel']= getattr(c, 'throttle', R['accel'])  # throttle before last step's traction-control cut.

    # Steer To Corner
    R['steer']= S['angle']*15 / PI
    # Steer To Center
    R['steer']-= S['trackPos']*.10
    # Steer Toward Open Road: bearing of the open road ahead, averaged over the
    # track beams weighted by distance squared (long beams point where the road goes).
    weights= [max(d, 0)**2 for d in S['track']]
    aim= 0
    if sum(weights) > 0:
        aim= sum(w*a for w, a in zip(weights, TRACK_ANGLES)) / sum(weights)  # degrees, + = right
        R['steer']-= aim*PI/180 * lookahead_gain
    # Racing Line (out-in-out): in a bend (bearing over 2 deg) move the centre
    # target to the outside while plenty of road is visible, and to the inside
    # once the road ahead shortens near the apex. trackPos +1 = left, so the
    # outside of a right-hand bend (aim > 0) is +.
    # Visible road ahead: the longest beam within 0.5 deg of the nose and, when
    # the car points within ahead_angle_max of the track direction, within 0.5
    # deg of the track direction too, so a car angled toward an edge on a
    # straight does not see a false end of the road.
    ahead= max(S['track'][8], S['track'][9], S['track'][10])
    track_dir= -S['angle']*180/PI   # bearing of the track direction, deg (+ = right)
    if abs(track_dir) <= ahead_angle_max:
        ahead= max(ahead, max(beam_at(S['track'], track_dir+d) for d in (-.5, 0, .5)))
    # The target must not follow the car's own nose, or the line's steering moves the target that moves the
    # steering. So the bend is held until the bearing falls below line_aim_off (side from the bearing while it is
    # over 2 deg), and the bend's progress is the road visible along the track direction, which does not swing with
    # the nose.
    side= getattr(c, 'line_side', 0)
    if abs(aim) > 2:
        side= 1 if aim > 0 else -1
    elif abs(aim) < line_aim_off:
        side= 0
    line_target= 0
    road= max(beam_at(S['track'], track_dir+d) for d in (-.5, 0, .5))   # along the track direction
    # Corner set-up: the bend is only detected (bearing over 2 deg) some 35 m before it, too late to move out. On the
    # straight before a bend the end of the road is a slanted edge: beams just left and right of the track direction
    # differ by metres from ~150 m out, the longer side being the way the road turns. Until the bend is detected, that
    # side moves the car to the outside. The steering gate (setup_steer) applies only when the set-up starts; it is
    # then held until the road falls to setup_road, a bend is detected, or the beams show the other side by setup_min
    # (gated on every step, the pull itself closed the gate and the set-up switched on and off). The pull is capped
    # at setup_pull: uncapped, the held pull left the track at the flick.
    setup= 0
    held= getattr(c, 'setup_side', 0)
    if side == 0 and setup_road < road < setup_dist:
        asym= beam_at(S['track'], track_dir+setup_beam) - beam_at(S['track'], track_dir-setup_beam)
        if held != 0 and asym*held > -setup_min:
            setup= held
        elif abs(prev_steer) < setup_steer and abs(asym) > setup_min:
            setup= 1 if asym > 0 else -1   # longer road to the right: right-hand bend
    c.setup_side= setup   # kept between steps
    if setup != 0:
        line_target= setup_offset*setup
        R['steer']+= clip((line_target - S['trackPos'])*line_gain, -setup_pull, setup_pull)
    c.apex_sf= apex_lp*getattr(c, 'apex_sf', abs(prev_steer)) + (1-apex_lp)*abs(prev_steer)
    if side != 0:
        phase= clip((road-60)/20, -1, 1)   # +1 approaching or exiting, -1 near the apex
        # Apex: in medium bends (moderate steering) the car can hold a tighter inside line, which opens the radius
        # of the whole bend. Near full lock it cannot: a target further inside only asks for more lock, so the extra
        # fades out with the low-passed |steer| (c.apex_sf) between apex_steer and +apex_steer_fade. On the raw
        # previous steer the fade is a loop of one step: the target and the steering swap every step.
        offset= line_offset
        if phase < 0:
            offset+= line_apex*clip((apex_steer+apex_steer_fade-c.apex_sf)/apex_steer_fade, 0, 1)
        # Exit release: the road along the track direction stays short through a bend and only grows once the car
        # is past the apex, but the phase stays at -1 (inside) until it is back over 60 m, which would hold the car
        # on the inside up to the bend's end. Once the road has grown rel_start past the bend's shortest road, the
        # inside target is released by rel_share (over rel_width), so the car unwinds toward the outside.
        if getattr(c, 'line_side', 0) != side:
            c.road_min= road
        c.road_min= min(getattr(c, 'road_min', road), road)
        if phase < 0:
            phase*= 1 - rel_share*clip((road - c.road_min - rel_start)/rel_width, 0, 1)
            # Exit run-out: the release above waits for the road along the track to grow, which comes late while
            # the car is still yawed into the bend. The plan's headroom (allowed speed of the previous step minus
            # the speed) says the bend no longer limits the car: from run_head the inside target is let go, fully
            # at run_head + run_width, smoothed by run_lp.
            run= clip((getattr(c, 'allowed_speed', 0) - S['speedX'] - run_head)/run_width, 0, 1)
            c.run= run_lp*getattr(c, 'run', 0) + (1-run_lp)*run
            phase*= 1 - c.run
        else:
            c.run= 0
        line_target= offset*phase*side
        R['steer']+= (line_target - S['trackPos'])*line_gain
    # Inside line integral: in a steady bend the heading term (angle*15/PI) pushes back on the line term, because
    # the body is yawed by the slip angle, so the car holds short of the inside target. The remaining error is
    # integrated (steer per second per unit of trackPos), only on the inside half of a bend (phase < 0, where the
    # line gains time) and faded out with |steer| like the apex extra (none near full lock). Elsewhere it fades by
    # line_idecay per step: an integral carried through the outside phase or out of a bend ran the flick approach off
    # the track.
    fi= 0
    if side != 0 and phase < 0:
        fi= clip((line_isteer+line_ifade-abs(prev_steer))/line_ifade, 0, 1)
    c.line_i= clip(getattr(c, 'line_i', 0)*(line_idecay + (1-line_idecay)*fi)
                   + (line_target - S['trackPos'])*.021*line_ki*fi, -line_imax, line_imax)
    R['steer']+= c.line_i
    c.line_side= side   # kept between steps
    # Planned line: inside plan_zones the steering above is replaced by a follower of the precomputed line (see the
    # knob block). The table says where the line is and how it bends; the loop is closed on the live readings:
    # trackPos against the line's position, the direction of travel (the nose angle less the slip angle, limited to
    # plan_slipmax) against the line's direction, plus the steering the line's curvature needs at this speed.
    pd= S['distFromStart']
    pn= len(plan_pos)
    def plan_at(tb, dd):   # table value at a distance, interpolated (the lap is closed)
        x= (dd/plan_ds) % pn; i= int(x); f= x-i
        return tb[i]*(1-f) + tb[(i+1)%pn]*f
    pw= clip(max(min(pd-z0, z1-pd) for z0, z1 in plan_zones)/plan_ramp, 0, 1)   # 1 inside a zone, fading over plan_ramp at its ends
    if pw > 0:
        pv= max(S['speedX'], 0)/3.6
        p0= plan_at(plan_pos, pd)
        p_dir= -atan(6*(plan_at(plan_pos, pd+plan_ds/2) - plan_at(plan_pos, pd-plan_ds/2))/plan_ds)   # the line's direction as an 'angle' reading (half-width 6 m)
        p_slip= atan2(S['speedY'], max(S['speedX'], 10))
        p_g= 1   # v1.27: 1 = full feedback gains, 0 = the flick's shares (slow, in the zone, outside the line: see plan_gz)
        if any(z0 <= pd < z1 for z0, z1 in plan_gz):
            p_g= 1 - (clip((plan_gv0 + plan_gvw - S['speedX'])/plan_gvw, 0, 1)
                      *clip((p0 - S['trackPos'])*(1 if plan_at(plan_curv, pd) > 0 else -1)/plan_gw, 0, 1))
        p_steer= ((S['angle'] - clip(p_slip, -plan_slipmax*PI/180, plan_slipmax*PI/180) - p_dir)*plan_kh*(plan_khlo + (1-plan_khlo)*p_g)
                  + (p0 - S['trackPos'])*plan_kp*(plan_kplo + (1-plan_kplo)*p_g)
                  + plan_at(plan_curv, pd + plan_la*pv)/1000*plan_ff*(1 + plan_ffv*pv*pv))
        R['steer']= pw*p_steer + (1-pw)*R['steer']
        line_target= p0
    c.aim, c.line_target, c.ahead= aim, line_target, ahead   # kept for telemetry only
    # Steering cap at speed: above ~100 km/h the front tyres are past their grip well before full lock; more lock
    # only scrubs, fades the sharpness plan's credit and limits the throttle. So |steer| is capped at steer_cap from
    # steer_cap_v0 + steer_cap_vw; below steer_cap_v0 full lock stays (hairpin, the flick's arcs).
    cap= 1 - (1-steer_cap)*clip((S['speedX']-steer_cap_v0)/steer_cap_vw, 0, 1)
    R['steer']= clip(R['steer'], -cap, cap)
    # Steering Rate Limit: a sudden jump in the beams (e.g. at a direction change)
    # cannot snap the wheel; it moves at most max_steer_step per step.
    R['steer']= clip(R['steer'], prev_steer-max_steer_step, prev_steer+max_steer_step)

    # Brake planning (sensors): the fastest speed from which the car can still slow to corner_speed within the road
    # visible straight ahead. The car slows harder at speed (drag and downforce), so the plan assumes
    # brake_decel + brake_aero*v^2. Slowing from v to v0 over d metres then gives
    # v^2 = ((a + c*v0^2)*exp(2*c*d) - a)/c, which is v0^2 + 2ad when c = 0. The assumed deceleration is capped at
    # brake_max; above the cap the slowing is constant: v^2 = v_cap^2 + 2*brake_max*(d - d_cap), with v_cap where the
    # curve meets the cap and d_cap = ln(brake_max/(a + c*v0^2))/(2c) the distance below it.
    # Crests unload the tyres: the mechanical part brake_decel is scaled by the load 1 + a_z/g, from the change of
    # speedZ (km/h per ~21 ms step, smoothed), between a floor and 1. The load read on a crest is applied to the whole
    # braking distance, but a crest lasts 20-50 m, so the floor is brake_load_min up to brake_load_v0 (close to a slow
    # corner the unloaded stretch is most of what is left) and rises to brake_load_fast over brake_load_vw.
    v_corner= corner_speed/3.6
    vz= S['speedZ']; az= (vz - getattr(c, 'vz_prev', vz))/3.6/.021; c.vz_prev= vz
    c.az= .7*getattr(c, 'az', 0) + .3*az   # m/s^2, smoothed
    load_floor= brake_load_min + (brake_load_fast-brake_load_min)*clip((S['speedX']-brake_load_v0)/brake_load_vw, 0, 1)
    a_mech= brake_decel*clip(1 + c.az/9.81, load_floor, 1)
    # Higher cap up to a speed: at full pedal the car slows at 39-43 m/s^2 from 160 to 280 km/h, so brake_max is
    # cautious. But the flick approach relies on the brake_max plan's early dips, so the higher cap counts only up to
    # brake_hi_v: allowed = min(plan at brake_max_hi, max(plan at brake_max, brake_hi_v)); with the car itself above
    # brake_hi_car it counts everywhere.
    def brake_dist_speed(d, a_max):   # m/s from which the car can slow to v_corner in d metres, planning at most a_max
        d= max(0, d-brake_margin)
        a0= a_mech + brake_aero*v_corner**2   # planned deceleration at v_corner
        if a0 >= a_max: return (v_corner**2 + 2*a_max*d)**.5
        d_cap= log(a_max/a0)/(2*brake_aero)
        if d <= d_cap: return ((a0*exp(2*brake_aero*d) - a_mech)/brake_aero)**.5
        return ((a_max - a_mech)/brake_aero + 2*a_max*(d - d_cap))**.5
    def brake_speed(d):
        if S['speedX'] > brake_hi_car: return brake_dist_speed(d, brake_max_hi)   # v1.05: no gate at speed (braking for 1,528 m, 1,927 m and the flick approach)
        return min(brake_dist_speed(d, brake_max_hi), max(brake_dist_speed(d, brake_max), brake_hi_v/3.6))
    allowed_speed= brake_speed(ahead) * 3.6
    # Corner speed from sharpness: the car may also go as fast as it could follow any beam: able to slow to
    # corner_speed within that beam's length (as above), and able to curve onto it -- reaching a point d metres away at
    # angle a needs a radius of d/(2 sin a), taken at turn_grip sideways. That curve passes bearing p at
    # 2*radius*sin(p), so every beam between the nose and this one must reach at least that far, or the curve leaves
    # the track. Never less than the plan from the road ahead.
    # Grip rises with speed (downforce): the sideways acceleration assumed is turn_grip*(1 + turn_grip_aero*v^2), so
    # v^2 = turn_grip*radius/(1 - turn_grip*turn_grip_aero*radius).
    # The credit above the road-ahead plan fades out with |steer| (full up to turn_steer_max - turn_steer_fade, none
    # from turn_steer_max) instead of switching off at one value, which turned a one-step steering spike into a full
    # brake. That |steer| is smoothed (fade_lp per step, ~0.2 s): the raw value swings the allowed speed by 10-18 km/h
    # in steady corners, a brake/throttle sawtooth.
    road_plan= sharp= allowed_speed
    c.steer_f= fade_lp*getattr(c, 'steer_f', abs(R['steer'])) + (1-fade_lp)*abs(R['steer'])
    # Grip to spare: in steady medium bends the car rides this plan at light steering, with the tyres not at their
    # limit. While the smoothed |steer| is light the plan assumes grip_boost more grip, fading out from boost_steer
    # over boost_fade; as the extra speed asks for more steering the extra fades: self-limiting.
    tg= turn_grip*(1 + grip_boost*clip((boost_steer+boost_fade-c.steer_f)/boost_fade, 0, 1))
    # Slip reference: the curve onto a beam starts along the direction the car travels, not along its nose. In a
    # bend the nose points inside the direction of travel by the slip angle, so the arc to an inside beam is tighter
    # than its nose angle says. The beam angles are shifted by slip_ref of the slip angle: a sliding car is allowed
    # less speed. Beams within 0.25 deg of the shifted zero are skipped.
    drift= -atan2(S['speedY'], max(S['speedX'], 10))*180/PI*slip_ref   # bearing of the direction of travel, deg (+ = right)
    angles= [a - drift for a in TRACK_ANGLES]
    if c.steer_f <= turn_steer_max:
        for d, a in zip(S['track'], angles):
            if d <= 0 or abs(a) < .25: continue
            radius= d / (2*sin(abs(a)*PI/180))
            if any(d2 < 2*radius*sin(abs(a2)*PI/180) for d2, a2 in zip(S['track'], angles)
                   if a2*a > 0 and abs(a2) < abs(a)): continue   # curve would leave the track
            v_brake= brake_speed(d)
            v_grip= (tg*radius/max(1 - tg*turn_grip_aero*radius, .1))**.5
            sharp= max(sharp, min(v_brake, v_grip)*3.6)
        allowed_speed= road_plan + (sharp-road_plan)*clip((turn_steer_max-c.steer_f)/turn_steer_fade, 0, 1)
    # S-bend look: the 19 track beams cannot tell a flat-out kink with a straight behind it (the start kink) from a
    # kink with a slow corner behind it (the flick approach): both show beams growing with the angle up to the kink's
    # inside edge. The five focus beams, 1 deg apart, can: at the start kink the rays keep growing toward the inside
    # edge; on the flick approach they jump at the next corner's inside edge and then fall, because the far edge faces
    # the car. The server answers a focus request once per second (-1 otherwise) and only when asked (an angle outside
    # +-90 deg asks for nothing and uses up no reading), so the look is asked for at the end of this function when the
    # longest beam sits at the edge of a kink. With the slow corner known, the plan is capped at the braking distance
    # to it for sb_hold steps.
    fo= S.get('focus', [-1]*5)
    fc= getattr(c, 'foc_next', 100)   # the angle asked for last step (100 = none)
    if fc != 100 and type(fo) is list and min(fo) >= 0:
        r= fo[::-1] if fc < 0 else fo      # by |angle| rising; r[4] is at the track beam's angle
        if min(r) > .5*max(r) and r[0] > r[4] + sb_fall:
            c.sb_d, c.sb_s, c.sb_n= max(r), 0, 0
    if getattr(c, 'sb_n', 999) < sb_hold:
        allowed_speed= min(allowed_speed, brake_speed(c.sb_d - c.sb_s - sb_x)*3.6)
        c.sb_s+= S['speedX']/3.6*.021; c.sb_n+= 1
    # Planned line's speed: on the planned line the beams look across the bend and the sensor plan reads more speed
    # than the line can carry, so inside plan_zones the plan is capped by the line's own speed.
    if pw > 0:
        allowed_speed= min(allowed_speed, plan_at(plan_v, pd)*plan_vs + 300*(1-pw))
    # Braking plan from track memory: inside plan_mem the stored speed is the plan itself (see the knob block); the
    # pedals below still close the loop on the live speed. Elsewhere the corner table's row is added to the plan.
    if any(z0 <= pd < z1 for z0, z1 in plan_mem):
        allowed_speed= plan_at(plan_v, pd + plan_vd)*plan_vs
    else:
        for z0, z1, zo in corner_table:
            if z0 <= S['distFromStart'] < z1: allowed_speed+= zo
    # Line-error guard: less speed allowed while the car is off the planned line (see the knob block).
    if pw > 0 and plan_ek > 0:
        allowed_speed*= 1 - pw*clip((abs(S['trackPos'] - plan_at(plan_pos, pd)) - plan_e0)*plan_ek, 0, plan_emax)
    c.allowed_speed= allowed_speed   # kept for telemetry and for the next step's exit run-out (v0.81)
    # Throttle from the stored speed's slope (see the knob block): 0 outside plan_tz and while the plan falls faster
    # than the car coasts.
    thr_ff= 0
    if plan_tk > 0 and any(z0 <= pd < z1 for z0, z1 in plan_tz):
        vms= max(S['speedX'], 0)/3.6
        tds= max(vms*plan_tla, 1)
        a_p= vms*(plan_at(plan_v, pd+plan_vd+tds) - plan_at(plan_v, pd+plan_vd))*plan_vs/3.6/tds   # m/s^2 the stored speed asks for
        thr_ff= clip((a_p + 5.75 + .00161*vms*vms)*plan_tk, 0, plan_tmax)

    # Throttle Control
    if S['speedX'] < min(target_speed - (abs(R['steer'])*50), allowed_speed):
        R['accel']+= .05
        # Throttle floor: the simulator's engine (simuv2 engine.cpp) gives Tmax*(throttle*(1 + k) - k),
        # k = 0.33*(rpm - 5,000 tickover)/(20,000 - 5,000): below throttle k/(1 + k) it brakes the rear wheels
        # (0.13 at 12,000 rpm, 0.21 at 17,000). So the stored throttle's ramp starts from the zero-torque throttle
        # instead of 0 (S['rpm'] as read, ~4.7 % high).
        eng_brk= .33*max(S['rpm']-5000, 0)/15000
        R['accel']= max(R['accel'], thr_zero*eng_brk/(1+eng_brk), thr_ff)
    else:
        R['accel']-= .01
    if S['speedX']<10:
       R['accel']+= 1/(S['speedX']+.1)

    # Brake Control
    # Lift band: in steady corners the car rides the plan, and a brake touch 0.5-1 km/h over it would zero the stored
    # throttle, which then climbs back at +0.05 per step (a brake/throttle sawtooth). So up to lift_pct % of the speed
    # over the allowed speed the car only lifts: throttle 0 this step, no brake, and the stored throttle is kept (the
    # -0.01 above is undone). Faded in from lift_v0 over lift_vw km/h: the slow corners brake at once. Beyond the
    # band the pedal is for the whole excess over the allowed speed, so braking zones follow the plan itself.
    lift_band= lift_pct/100*S['speedX']*clip((S['speedX']-lift_v0)/lift_vw, 0, 1)
    lift= False
    dab= False
    R['brake']= 0
    if ahead >= 0 and S['speedX'] > allowed_speed + lift_band:
        R['brake']= min(1, (S['speedX']-allowed_speed)*brake_gain)
        # Brake touch: a touch lighter than touch_brake keeps touch_keep of the stored throttle instead of zeroing
        # it; nothing is sent while braking.
        # Brake dab: at the flat-out kink after the start the sensor plan dips under the car's speed for one step.
        # A brake application is not known to be a braking zone until it lasts: for its first dab_n steps the stored
        # throttle is kept (dab_keep per step), with the wheel near straight and below dab_v.
        c.brk_n= getattr(c, 'brk_n', 0) + 1   # steps of this brake application
        dab= c.brk_n <= dab_n and c.steer_f < dab_steer and S['speedX'] < dab_v
        touch_thr= R['accel']*(dab_keep if dab else touch_keep*(R['brake'] < touch_brake))
        R['accel']= 0
    elif ahead >= 0 and S['speedX'] > allowed_speed:
        c.brk_n= 0
        lift= True
        R['accel']= max(R['accel']+.01, 0)   # stored throttle kept; the throttle sent is 0 (end of drive_example)

    # ABS: cut the brake to abs_cut once any wheel turns below abs_ratio of the car speed (locking).
    if R['brake'] > 0 and S['speedX'] > 20:
        slowest_wheel= min(S['wheelSpinVel'])*.3   # rad/s * ~0.3 m wheel radius = m/s
        if slowest_wheel < abs_ratio*S['speedX']/3.6:
            R['brake']*= abs_cut

    # Throttle near full lock: at full lock the car is already turning as tight as it can, so more speed only pushes
    # it wide. Above lock_steer the throttle is limited, falling linearly to the limit below at full lock. The stored
    # throttle is limited too, so it cannot wind up and snap open as the wheel straightens.
    lock= clip((abs(R['steer'])-lock_steer)/(1-lock_steer), 0, 1)   # 0 below lock_steer, 1 at full lock
    # Time to the edge: the full-lock arc drifts outward, so the limit is set by how soon the car would reach the
    # outside edge at its present drift, room / outward rate of trackPos (smoothed): none at lock_tte_near seconds or
    # less, lock_throttle at lock_tte_far, on the same line up to lock_throttle_max once the drift stops or the edge
    # is far. Outside = right in a left turn (steer +), left in a right turn.
    out_side= 1 if R['steer'] > 0 else -1
    room= 1 + out_side*S['trackPos']   # trackPos units to the outside edge
    out_rate= -out_side*(S['trackPos'] - getattr(c, 'tp_prev', S['trackPos']))/.021   # units per second toward that edge
    c.tp_prev= S['trackPos']
    c.out_rate= .7*getattr(c, 'out_rate', 0) + .3*out_rate   # smoothed
    tte= room/max(c.out_rate, .05)   # s to the outside edge
    lt= clip(lock_throttle*(tte-lock_tte_near)/(lock_tte_far-lock_tte_near), 0, lock_throttle_max)
    R['accel']= min(R['accel'], 1 - lock*(1-lt))
    # Exit guard (see the knob block): throttle taken off while the car is, or is about to be, outside the planned
    # line by more than plan_x0. The stored throttle is limited too, like the full-lock limit above.
    xe= S['trackPos'] - plan_at(plan_pos, pd)   # off the planned line, + = left of it
    c.xe_rate= .7*getattr(c, 'xe_rate', 0) + .3*(xe - getattr(c, 'xe_prev', xe))/.021   # per second, smoothed
    c.xe_prev= xe
    xg= 1
    if plan_xk > 0 and any(z0 <= pd < z1 for z0, z1 in plan_mem):
        xg= 1 - pw*clip((-out_side*(xe + c.xe_rate*plan_xt) - plan_x0)*plan_xk, 0, 1)
    R['accel']= min(R['accel'], xg)

    # Traction control: how much faster the rear (driven) wheels' surface moves than the fronts', in m/s (tyre radii
    # from car1-ow1.xml). Beyond the limit the throttle sent is cut in proportion. The cut is not kept: the next step
    # starts from the throttle before it (c.throttle), so a burst of wheelspin does not cost a slow climb back. But a
    # cut released at once lets the throttle snap back and chatter 0 <-> 1, so the cut fades out: at least tc_hold of
    # last step's cut stays.
    # On a straight exit the rear tyres carry no sideways load and pull harder with more slip, so the limit rises by
    # up to tc_slip_straight as the wheel straightens (none from tc_slip_steer). A sliding car counter-steers toward
    # 0, which would raise the limit and feed the slide, so the extra also fades out with sideways speed, gone at
    # tc_slip_slide.
    w= S['wheelSpinVel']
    rear_over= (w[2]+w[3])/2*.315 - (w[0]+w[1])/2*.302
    slip_target= tc_slip + tc_slip_straight*clip(1-abs(R['steer'])/tc_slip_steer, 0, 1)*clip(1-abs(S['speedY'])/tc_slip_slide, 0, 1)
    # Slip ratio: the simulator's tyre force (simuv2 wheel.cpp) depends on over-speed / car speed, not on m/s, so
    # the limit is scaled with the speed, equal to the value above at tc_vref.
    slip_target*= S['speedX']/tc_vref
    # Launch: the lap is timed from a standing start, where wheelspin lets the engine rev into its power band like
    # a slipping clutch, so the limit is raised until traction control in effect never cuts. Latched off for the rest
    # of the run once launch_v is first reached.
    c.launch= getattr(c, 'launch', True) and S['speedX'] < launch_v
    if c.launch: slip_target+= launch_slip
    # Straight exits: out of the hairpin and the Corkscrew the car runs straight at low rpm, the same state as the
    # standing start. So below exit_v the launch allowance applies again, faded out with |steer| (none from
    # exit_steer) and sideways speed (none from exit_vy): only while the car is straight and not sliding.
    elif S['speedX'] < exit_v:
        slip_target+= launch_slip*clip(1-abs(R['steer'])/exit_steer, 0, 1)*clip(1-abs(S['speedY'])/exit_vy, 0, 1)
    c.throttle= clip(R['accel'], 0, 1)
    c.tc_cut= max(clip((rear_over-slip_target)*tc_gain, 0, 1), getattr(c, 'tc_cut', 0)*tc_hold)
    R['accel']= c.throttle - c.tc_cut
    if R['brake'] == 0 and not lift: c.brk_n= 0
    if 0 < R['brake'] < touch_brake or (dab and R['brake'] > 0):   # brake touch or dab: stored throttle kept, nothing sent
        c.throttle= min(c.throttle + touch_thr, 1); R['accel']= 0
    if lift:
        R['accel']= 0   # lift band: nothing sent, c.throttle stays for the next step
        if thr_ff > 0 and lift_band > 0:   # v1.19: but the throttle the stored speed's slope asks for, faded out toward the top of the band
            R['accel']= max(min(thr_ff*(1 - clip((S['speedX']-allowed_speed)/lift_band, 0, 1)), 1 - lock*(1-lt), xg) - c.tc_cut, 0)

    # Clutch slip: the simulator (simuv2 engine.cpp / transmission.cpp) passes engine torque * min(3*(1 - pedal), 1)
    # to the wheels, so all of it up to pedal 2/3, while the engine speed follows the wheels only by (1 - pedal)^4 per
    # simulation step: with the clutch partly pressed the engine revs up on its own and still drives at full torque.
    # Above the 18,700 limiter the engine torque is 0, so the pedal eases off as the driven wheels' rpm (rear wheel
    # speed * gear ratio * final drive) nears clutch_top, with the coupling
    # (1 - pedal)^4 = clutch_k/(clutch_top - wheel rpm + clutch_k). The engine rpm is then no longer the gear's rpm,
    # so the upshift reads the driven wheels' rpm instead (same value when the clutch is closed).
    axle_rpm= (w[2]+w[3])/2*[3.9, 2.9, 2.3, 1.87, 1.68, 1.54][max(int(S['gear']), 1)-1]*4.5*60/(2*PI)
    R['clutch']= 0
    if R['brake'] == 0 and c.throttle > 0 and axle_rpm < clutch_top:
        R['clutch']= min(clutch_slip, 1 - (clutch_k/(clutch_top-axle_rpm+clutch_k))**.25)

    # Automatic transmission: shift up when the driven wheels' rpm (axle_rpm) passes upshift_rpm; shift down only when
    # the lower gear would land the engine rpm below a threshold, and never below lowest_running_gear (1st gear's
    # engine braking makes the rear step out in slow corners). The threshold is downshift_rpm, or:
    # - brake_ds_rpm while braking more than brake_ds_over above the plan (on the flick approach the pedal is at its
    #   limit and ABS-cut; engine braking a gear lower is deceleration the ABS cut does not touch);
    # - drive_ds_rpm on the throttle (gear for the exit);
    # - entry_ds_rpm / entry_ds2_rpm inside their zones (gear into the bend).
    gear_ratios= [3.9, 2.9, 2.3, 1.87, 1.68, 1.54]   # gears 1-6, from car1-ow1.xml
    gear= int(S['gear'])
    if gear < 1 or S['speedX'] < 10:
        gear= 1
    elif gear < 6 and axle_rpm > upshift_rpm:
        gear+= 1
    elif (gear > lowest_running_gear and (getattr(c, 'up_t', 99) >= upshift_hold or R['brake'] > 0)
          and S['rpm']*gear_ratios[gear-2]/gear_ratios[gear-1] < (brake_ds_rpm if R['brake'] > 0 and S['speedX']-allowed_speed > brake_ds_over
             else max(drive_ds_rpm, downshift_rpm) if R['brake'] == 0 and c.throttle > 0 and getattr(c, 'sh_t', 99) >= drive_ds_wait   # Gear For The Exit (v1.22)
             else max(entry_ds_rpm, downshift_rpm) if any(z0 <= pd < z1 for z0, z1 in entry_ds_zones)   # Gear Into The Bend (v1.23)
             else max(entry_ds2_rpm, downshift_rpm) if any(z0 <= pd < z1 for z0, z1 in entry_ds2_zones)   # the same at 770 m and 1,528 m's upper gears, lower threshold (v1.31)
             else downshift_rpm)):
        gear-= 1
    # First gear at full lock: at full lock (hairpin, the flick's left arc) the front tyres are saturated and the
    # car drifts to the outside edge off the throttle. First gear brakes the rear wheels only, which slows the car
    # and turns it in. The exit is still driven in 2nd: back up once the wheel unwinds.
    if S['speedX'] > 10 and not c.launch:
        if gear == 2 and abs(R['steer']) > lock_gear_on and S['speedX'] < lock_gear_v: gear= 1
        elif gear == 1 and abs(R['steer']) < lock_gear_off: gear= 2
    c.up_t= 0 if gear > int(S['gear']) else getattr(c, 'up_t', 99) + 1   # steps since the last upshift
    c.sh_t= 0 if gear != int(S['gear']) else getattr(c, 'sh_t', 99) + 1   # steps since the last shift (v1.22)
    R['gear']= gear
    # Focus request (see S-bend look): one integer angle, the centre of the five beams, taken by the server for its
    # next reading.
    c.foc_sent= getattr(c, 'foc_next', 100)   # for telemetry: the angle this step's reading was asked at
    c.foc_next= 100
    il= max(range(19), key=lambda i: S['track'][i])
    if (1 <= il <= 17 and abs(TRACK_ANGLES[il]) >= sb_a and S['speedX'] > sb_v and c.steer_f < sb_steer
            and S['track'][il + (1 if il > 9 else -1)] < .5*S['track'][il]):
        c.foc_next= int(TRACK_ANGLES[il]) - (2 if il > 9 else -2)
    R['focus']= [c.foc_next]
    # Upshift clutch: for the shift time (0.05 s, car1-ow1.xml) after a gear change the simulator opens the clutch
    # itself and caps the throttle at 0.1 whenever the clutch pedal is below 0.01, so every upshift lost a step of
    # drive. Holding the pedal at clutch_slip (full engine torque still passed) for the shift time keeps the drive on
    # and the engine up; the slip law above then eases the clutch shut as before.
    if c.up_t < shift_steps and R['brake'] == 0 and c.throttle > 0:
        R['clutch']= clutch_slip
    return

def beam_at(track, bearing):
    '''Distance to the track edge along any bearing (deg, + = right),
    interpolated between the two neighbouring track beams.'''
    for i in range(len(TRACK_ANGLES)-1):
        a0, a1= TRACK_ANGLES[i], TRACK_ANGLES[i+1]
        if a0 <= bearing <= a1:
            f= (bearing-a0)/(a1-a0)
            return track[i]*(1-f) + track[i+1]*f
    return track[0] if bearing < 0 else track[-1]

# ================ MAIN ================
if __name__ == "__main__":
    C= Client(p=3001)
    # Telemetry: one CSV row per step in runs/ (does not affect driving).
    run_dir= os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'runs')
    os.makedirs(run_dir, exist_ok=True)
    log_path= os.path.join(run_dir, time.strftime('run_%Y%m%d_%H%M%S.csv'))
    log_file= open(log_path, 'w', buffering=1)  # line-buffered: rows survive Ctrl-C.
    log_file.write('step,curLapTime,lastLapTime,distFromStart,speedX,speedY,gear,rpm,'
              'accel,brake,steer,trackPos,angle,ahead,rearSpin,damage,aim,lineTarget,aheadPlan,allowed,throttle,' +
              ','.join('track%d' % i for i in range(19)) + ',focA,foc0,foc1,foc2,foc3,foc4\n')  # track0-18: beams at TRACK_ANGLES; focA: focus angle asked for (100 = none), foc0-4: focus beams at focA-2..focA+2 (-1 = no reading)
    print("Logging telemetry to %s" % log_path)
    for step in range(C.maxSteps,0,-1):
        C.get_servers_input()
        if not C.so: break # Server ended the race.
        # End the run as soon as any damage is taken.
        if C.S.d.get('damage', 0) > 0:
            print("Damage taken (%.0f) at %.1f m, lap time %.2f s. Ending run." %
                  (C.S.d['damage'], C.S.d.get('distRaced', 0), C.S.d.get('curLapTime', 0)))
            break
        drive_example(C)
        C.respond_to_server()
        S,R= C.S.d,C.R.d
        w= S['wheelSpinVel']
        log_file.write('%d,%.3f,%.3f,%.1f,%.1f,%.1f,%d,%.0f,%.3f,%.3f,%.3f,%.3f,%.3f,%.1f,%.1f,%.0f,%.2f,%.3f,%.1f,%.1f,%.3f,%s,%d,%s\n' % (
            C.maxSteps-step, S['curLapTime'], S['lastLapTime'], S['distFromStart'],
            S['speedX'], S['speedY'], S['gear'], S['rpm'], R['accel'], R['brake'],
            R['steer'], S['trackPos'], S['angle'], max(S['track'][8:11]),
            (w[2]+w[3])-(w[0]+w[1]), S['damage'], C.aim, C.line_target, C.ahead, C.allowed_speed, C.throttle,
            ','.join('%.1f' % d for d in S['track']), C.foc_sent, ','.join('%.1f' % d for d in S['focus'])))
    log_file.close()
    C.shutdown()
