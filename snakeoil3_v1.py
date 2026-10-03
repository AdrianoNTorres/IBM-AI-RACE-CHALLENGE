#!/usr/bin/python
# snakeoil.py
# Chris X Edwards <snakeoil@xed.ch>
# Snake Oil is a Python library for interfacing with a TORCS
# race car simulator which has been patched with the server
# extentions used in the Simulated Car Racing competitions.
# http://scr.geccocompetitions.com/
#
# To use it, you must import it and create a "drive()" function.
# This will take care of option handling and server connecting, etc.
# To see how to write your own client do something like this which is
# a complete working client:
# /-----------------------------------------------\
# |#!/usr/bin/python                              |
# |import snakeoil                                |
# |if __name__ == "__main__":                     |
# |    C= snakeoil.Client()                       |
# |    for step in xrange(C.maxSteps,0,-1):       |
# |        C.get_servers_input()                  |
# |        snakeoil.drive_example(C)              |
# |        C.respond_to_server()                  |
# |    C.shutdown()                               |
# \-----------------------------------------------/
# This should then be a full featured client. The next step is to
# replace 'snakeoil.drive_example()' with your own. There is a
# dictionary which holds various option values (see `default_options`
# variable for all the details) but you probably only need a few
# things from it. Mainly the `trackname` and `stage` are important
# when developing a strategic bot.
#
# This dictionary also contains a ServerState object
# (key=S) and a DriverAction object (key=R for response). This allows
# you to get at all the information sent by the server and to easily
# formulate your reply. These objects contain a member dictionary "d"
# (for data dictionary) which contain key value pairs based on the
# server's syntax. Therefore, you can read the following:
#    angle, curLapTime, damage, distFromStart, distRaced, focus,
#    fuel, gear, lastLapTime, opponents, racePos, rpm,
#    speedX, speedY, speedZ, track, trackPos, wheelSpinVel, z
# The syntax specifically would be something like:
#    X= o[S.d['tracPos']]
# And you can set the following:
#    accel, brake, clutch, gear, steer, focus, meta
# The syntax is:
#     o[R.d['steer']]= X
# Note that it is 'steer' and not 'steering' as described in the manual!
# All values should be sensible for their type, including lists being lists.
# See the SCR manual or http://xed.ch/help/torcs.html for details.
#
# If you just run the snakeoil.py base library itself it will implement a
# serviceable client with a demonstration drive function that is
# sufficient for getting around most tracks.
# Try `snakeoil.py --help` to get started.

# for Python3-based torcs python robot client
import socket
import sys
import getopt
import os
import time
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

        n_fail = 5
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
            print("Error sending to server: %s Message %s" % (emsg[1],str(emsg[0])))
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
        # Comment the next line for raw output:
        return self.fancyout()
        # -------------------------------------
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
    '''This is only an example. It will get around the track but the
    correct thing to do is write your own `drive()` function.'''
    S,R= c.S.d,c.R.d
    target_speed=300  # km/h throttle aim on straights; above the car's ~270 top speed, so it no longer caps (the braking plan sets corner speeds).
    corner_speed=78   # km/h the car must be able to slow to by the end of the visible road (v0.68: 76 -> 79; v0.70: 78, enabling change: hairpin/flick margin for the launch, 79 + launch leaves the track 1 of 30, 78 + launch 0).
    brake_decel=14.0  # m/s^2 of deceleration assumed when planning (measured ~13.9 at pedal 0.2-0.3, 18-30 above 0.3 at speed).
    brake_aero=.0065  # extra planned deceleration per (m/s)^2 of speed: brake_decel*load + brake_aero*v^2 (drag and downforce; v0.77: .006 -> .0065, with abs_ratio .8).
    brake_max=30      # m/s^2: most deceleration ever planned (measured ~27-30 at 200-240 km/h; brake_aero*v^2 alone would claim 40+; 28 -> 30 on the clutch car: 0.14 s over 30 perturbed laps, 26 is 0.23 s slower).
    brake_max_hi=34   # v0.95: m/s^2: ... but up to this much where that only lifts the allowed speed up to brake_hi_v (at full pedal the car slows at 39-43 m/s^2 from 160 to 280 km/h; the 27-30 measured before was at pedal ~0.65, which is all the plan asked for) ...
    brake_hi_v=235    # km/h: ... above this allowed speed the plan stays on brake_max (the flick approach, 245-275 km/h over a crest into the kink, is pedal-limited and ABS-cut and relies on the early dips of the brake_max plan; 245: 2 of 30 off).
    brake_load_min=.5 # brake_decel is scaled by the tyre load from the vertical acceleration (crests), never below this share at low speed ...
    brake_load_fast=.8  # v0.91: ... and never below this share at speed (a crest is short against a long braking distance; .5 at speed braked for crests that were over before the corner, 1.0 leaves the track at the flick) ...
    brake_load_v0=150   # km/h: ... the floor is brake_load_min up to this speed ...
    brake_load_vw=50    # km/h: ... rising linearly to brake_load_fast over this much more speed (full from 200).
    brake_margin=15   # m of visible road kept in reserve.
    brake_gain=.05    # brake pedal per km/h over the allowed speed (20 km/h over = full brake).
    lookahead_gain=2.0  # steer per radian of bearing toward the open road ahead.
    line_offset=.47     # racing line: trackPos aimed for, outside before/after a bend, inside near the apex (0 = centre).
    line_gain=.50       # steer per unit of trackPos away from the racing line (only in bends).
    line_aim_off=1      # deg: a bend starts when the bearing passes 2 deg and lasts until it falls below this.
    line_apex=.45       # extra trackPos aimed for on the inside near the apex (on top of line_offset) ...
    apex_steer=.5       # ... in full while the smoothed |steer| is below this ...
    apex_steer_fade=.25 # ... and fading out over this much more |steer| (none from 0.75: hairpin, flick).
    apex_lp=.9          # ... |steer| low-passed per step for that fade (v0.88: on the raw value the target and the steering chased each other).
    line_ki=1.5         # inside line integral: steer added per second per unit of trackPos short of the inside target ...
    line_imax=.4        # ... at most this much steer ...
    line_isteer=.4      # ... in full while |steer| is below this ...
    line_ifade=.25      # ... fading out over this much more |steer| (none from 0.65: hairpin, flick) ...
    setup_dist=160      # m: corner set-up (v0.58): with less road than this visible along the track direction ...
    setup_beam=2        # deg: ... the beams this far either side of it ...
    setup_min=3         # m: ... differing by more than this tell the coming bend's side early.
    setup_offset=.85    # trackPos aimed for on the outside during the set-up ...
    setup_road=85       # m: ... while more road than this is visible along the track direction (v0.80: 95 -> 80 with the held set-up; v0.82: 85, 0.035 s over 30 perturbed laps; a set-up held closer to the bend, 30-70 m, is 0.03-0.55 s slower: the outward yaw brings the bend detection and the turn-in forward).
    setup_steer=.045    # no set-up starts while |steer| is above this (the car is still in a bend: kink, flick approach); v0.80: once started it is held.
    setup_pull=.15      # v0.80: most steer the set-up pull may add (uncapped it reached ~0.28 and the held set-up left the track at the flick).
    line_idecay=.85     # ... and outside the inside half of a bend it fades by this share per step.
    rel_start=7         # m: exit release (v0.61): once the road along the track has grown this much past the bend's shortest ...
    rel_width=2         # m: ... the inside target is released over this much more road ...
    rel_share=.8        # ... by this share (the car runs out toward the exit; the inside integral is kept).
    run_head=10         # km/h: exit run-out (v0.81): once the plan allows this much more than the car's speed on the inside half of a bend ...
    run_width=15        # km/h: ... the inside target is let go over this much more headroom (all of it from run_head + run_width) ...
    run_lp=.8           # ... smoothed: share of the previous step's value kept (the allowed speed jumps step to step; unsmoothed it was slower).
    max_steer_step=.2   # most the steering may change in one step (~21 ms).
    steer_cap=.62       # v0.94: most |steer| at speed (above it the front tyres are past their grip: the turn-in spikes to 0.63-0.78 and the 0.64-0.68 held in the 450 m bend turned the car no more; .45 costs only 0.06 s) ...
    steer_cap_v0=95     # km/h: ... no cap up to this speed (hairpin and the flick's arcs need full lock) ...
    steer_cap_vw=10     # km/h: ... full cap from steer_cap_v0 + steer_cap_vw (linear between).
    upshift_rpm=18600   # shift up when the driven wheels' rpm (axle_rpm, since v0.79; not the engine rpm) passes this, just under the limiter (18,700): power still rises to 18,000 and the gears are close.
    downshift_rpm=15000 # shift down only if the lower gear would land below this (v0.54: keeps the engine near its 16-18k torque peak).
    brake_ds_rpm=17500  # v0.86: while braking more than brake_ds_over above the allowed speed, shift down as soon as the lower gear would land below this instead (engine braking on the rear wheels; under the 18,700 limiter) ...
    brake_ds_over=20    # km/h: ... the car is behind the braking plan by more than this (pedal demand at its 1.0 limit: flick approach 20-50 km/h over; the other braking zones run 10-16 over and keep downshift_rpm).
    upshift_hold=15     # v0.65: steps (~0.3 s) after an upshift with no downshift unless braking (the rpm dips ~3,000 for 1-2 steps while the clutch engages: 2-3-2-3 hunts).
    lowest_running_gear=2  # never shift down below this while moving (1st is only for the start and, since v0.90, for full lock).
    lock_gear_on=.96    # v0.90: first gear at full lock: in 2nd, above this |steer| and below lock_gear_v the car shifts down to 1st (engine braking on the rear wheels turns the car in; the fronts are saturated) ...
    lock_gear_v=105     # km/h: ... only below this speed (1st reaches the 18,700 limiter at 127 km/h) ...
    lock_gear_off=.72   # ... and back up to 2nd once |steer| falls below this (the exit is driven in 2nd: 1st on a straight exit was slower, v0.23 / batch 6).
    ahead_angle_max=3   # deg: also measure the road ahead along the track direction when the car points within this of it.
    turn_grip=8.0       # m/s^2 of sideways acceleration assumed when curving onto a beam (0 = plan from the road ahead only); 7.0 -> 8.0 with slip_ref .3 (the beams are now seen at wider angles while the car slides).
    turn_steer_max=.78  # curving onto beams is not planned above this |steer| (near full lock).
    turn_steer_fade=.17 # its credit fades out linearly over this much |steer| below turn_steer_max (full credit up to 0.61).
    fade_lp=.9          # that |steer| is smoothed: share of the previous smoothed value kept per step (v0.57; 0 = raw steer).
    turn_grip_aero=1.5e-4  # turn_grip rises by this share per (m/s)^2 of speed (downforce): +12% at 100 km/h, +46% at 200.
    grip_boost=.3       # v0.60: turn_grip is raised by this share while the smoothed |steer| is below boost_steer ...
    boost_steer=.2      # ... (light steering = grip to spare: steady medium bends ride the plan at |steer| 0.15-0.3) ...
    boost_fade=.1       # ... fading out over this much more |steer| (none from 0.3).
    slip_ref=.3         # sharpness plan: the beam angles are measured from the nose turned by this share of the slip angle (atan(speedY/speedX)) toward the direction of travel (0 = from the nose, 1 = from the direction of travel).
    tc_slip=4.5         # m/s the rear wheels may outrun the fronts before traction control cuts (v0.63: 2.5 -> 4.5; 2.5 was the v0.28 peak, the car now exits on the line with grip to spare).
    tc_gain=.3          # throttle cut per m/s of rear over-speed beyond tc_slip (v0.96: .5 -> .3: the tyre force still rises with slip past its peak, so a softer cut keeps more drive; .2 is as fast with less margin, .1 runs to 0.98 of the edge, 0 leaves the track).
    tc_hold=.8          # share of last step's traction-control cut still applied this step (fades the cut out).
    tc_slip_straight=5.0  # m/s of extra over-speed allowed when the car goes straight (the rears carry no sideways load).
    tc_slip_steer=.7    # |steer| at which that extra is gone (it falls linearly from steer 0 to here).
    tc_vref=110         # km/h: slip ratio: the over-speed limit above (tc_slip + the straight extra) holds at this speed and scales with speed/tc_vref (the tyre force depends on over-speed / speed, not on m/s); launch_slip is added after.
    tc_slip_slide=20    # km/h of sideways speed at which that extra is gone too (no extra while the car slides).
    lock_steer=.6       # above this |steer| the throttle is limited, falling to lock_throttle at full lock.
    lock_throttle=.2    # throttle allowed at full lock when the car would reach the outside edge in lock_tte_far seconds at its present drift (v0.76; until v0.75 the most allowed, set by the room to the edge).
    lock_tte_near=.9    # s: time to the outside edge (room / outward drift rate) at or below which no throttle is allowed at full lock ...
    lock_tte_far=1.7    # s: ... rising linearly through lock_throttle at this time to the edge ...
    lock_throttle_max=.5   # ... up to this much once the drift has stopped or the edge is far (hairpin exit, the flick's right arc).
    lift_pct=3.5        # % of speed over the allowed speed where the car only lifts (throttle 0, stored throttle kept), before braking (v0.93: 1.0 -> 3.5, and the band is no longer taken off the brake pedal; 4.5 leaves the track at the flick 1 of 30).
    lift_v0=86          # km/h: no lift band below this speed (slow corners brake at once) ...
    lift_vw=57          # km/h: ... full band from lift_v0 + lift_vw (linear between).
    touch_brake=.15     # v0.64: a brake touch lighter than this pedal keeps touch_keep of the stored throttle ...
    touch_keep=.7       # ... (instead of zeroing it), so the throttle resumes there after the touch.
    dab_n=2             # v1.01: brake dab: for the first this many steps of a brake application, whatever the pedal, dab_keep of the stored throttle is kept per step (0 = off; 1-3 measure the same: the dabs that matter last one step) ...
    dab_keep=.7         # ... (1.0 and .5 gain half as much) ...
    dab_steer=.15       # ... only while the smoothed |steer| is below this (a dab in a bend still restarts the throttle from its floor; with no steer and no speed gate and dab_keep 1: 1 of 30 off at the flick) ...
    dab_v=230           # km/h: ... and only below this speed (start kink 219-229 km/h; 240 measures the same, 250 reaches the flick approach, where the brake touches at 245-275 km/h set the arc entry speed: shifted max 0.98).
    thr_zero=1.0        # throttle floor: while the car is under the allowed speed the stored throttle is at least this share of the engine's zero-torque throttle (0.13 at 12,000 rpm, 0.21 at 17,000; 0 = off; 1.6 leaves the track 1 of 30).
    abs_ratio=.8        # ABS: the brake is cut once the slowest wheel turns below this share of the car speed (v0.55: 0.8 -> 0.85; v0.77: back to 0.8 with brake_aero .0065) ...
    abs_cut=.5          # ... to this share of the pedal.
    launch_v=130        # km/h: standing start (v0.71; v0.69 rejected at corner_speed 79): until the car first reaches this speed ...
    launch_slip=25      # m/s: ... this much more rear over-speed is allowed before traction control cuts (in practice no cut).
    exit_steer=.3       # v0.72: below launch_v after the launch, launch_slip also applies while the car runs straight (out of the hairpin and the Corkscrew), full at steer 0, none from this |steer| ...
    exit_vy=6           # ... and none from this sideways speed (km/h; no extra while the car slides).
    clutch_slip=.667    # most clutch pedal while accelerating (v0.78: .7; v0.79: 2/3, the most at which TORCS still passes the full engine torque: min(3*(1 - pedal), 1)) ...
    clutch_top=17000    # ... v0.79: slipped in every gear while the rpm of the driven wheels (rear wheel speed * gear ratio * final drive) is below this ...
    clutch_k=60         # ... easing off toward it: pedal = 1 - (clutch_k/(clutch_top - wheel rpm + clutch_k))^(1/4) (rpm; larger = closed sooner).
    shift_steps=3       # v0.92: for this many steps from an upshift (the 0.05 s shift time = 2.5 steps) the clutch pedal is held at clutch_slip while accelerating (0 = off: TORCS then opens the clutch itself and caps the throttle at 0.1).
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
    # The target must not follow the car's own nose, or the line's steering moves
    # the target that moves the steering (v0.32: target jumped 261 times a lap).
    # So the bend is held until the bearing falls below line_aim_off (side from
    # the bearing while it is over 2 deg), and the bend's progress is the road
    # visible along the track direction, which does not swing with the nose.
    side= getattr(c, 'line_side', 0)
    if abs(aim) > 2:
        side= 1 if aim > 0 else -1
    elif abs(aim) < line_aim_off:
        side= 0
    line_target= 0
    road= max(beam_at(S['track'], track_dir+d) for d in (-.5, 0, .5))   # along the track direction
    # Corner set-up: the bend is only detected (bearing over 2 deg) some 35 m
    # before it, when the road ahead is already under 60 m, so the line went
    # straight to the inside and entries used +-0.15 of the width (v0.57).
    # On the straight before a bend the end of the road is a slanted edge:
    # beams just left and right of the track direction differ by metres from
    # ~150 m out, the longer side being the way the road turns. Until the
    # bend is detected, that side moves the car to the outside.
    # v0.59: wider (0.85) and ended earlier (95 m of road, was 80), with the
    # steering gate at 0.045 (was 0.02); only in that combination (offset
    # alone 0.85 or end 95 m alone: slower).
    # Held set-up (v0.80): the pull itself (~0.28 steer at once) closed the
    # steering gate on the next step, so the set-up switched on and off every
    # 2-3 steps all the way down the approach (v0.79: 283 steering reversals,
    # 12.1 s of the lap in oscillation, 326 target flips) and the car moved
    # only ~0.05 of the 0.57 to its target. Now the gate applies only when the
    # set-up starts; it is then held until the road falls to setup_road, a
    # bend is detected, or the beams show the other side by setup_min. The
    # pull is capped at setup_pull: the heading and look-ahead terms push back
    # with ~6.8 steer per radian of yaw, so 0.15 holds the car ~0.02 rad
    # toward the outside (the uncapped held pull left the track at the flick).
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
        # Apex: in medium bends (moderate steering) the car can hold a tighter
        # inside line, which opens the radius of the whole bend (v0.52 trials:
        # inside offset 0.7-0.8 alone was 0.3-0.5 s faster over 30 perturbed
        # laps, a wider outside 0.6 was not). Near full lock (hairpin, flick)
        # it cannot: a target further inside only asks for more lock, so the
        # extra fades out with |steer| between apex_steer and +apex_steer_fade.
        # v0.88: the fade reads the low-passed |steer| (c.apex_sf). On the raw
        # previous steer the fade was a loop of one step (more steer -> less
        # target -> less steer): in the 450 m bend, which runs at |steer| ~0.5,
        # the target and the steering swapped every step.
        offset= line_offset
        if phase < 0:
            offset+= line_apex*clip((apex_steer+apex_steer_fade-c.apex_sf)/apex_steer_fade, 0, 1)
        # Exit release (v0.61): the road along the track direction stays short
        # through a bend and only grows once the car is past the apex, but the
        # phase stays at -1 (inside) until it is back over 60 m, so the line
        # held the car on the inside up to the bend's end (448 m: target
        # +0.5 inside to 529 m; 1,522 m: to 1,590 m), asking for steering the
        # exit could have spent on throttle. Once the road has grown rel_start
        # past the bend's shortest road, the inside target is released by
        # rel_share (over rel_width), so the car unwinds toward the outside.
        if getattr(c, 'line_side', 0) != side:
            c.road_min= road
        c.road_min= min(getattr(c, 'road_min', road), road)
        if phase < 0:
            phase*= 1 - rel_share*clip((road - c.road_min - rel_start)/rel_width, 0, 1)
            # Exit run-out (v0.81): the release above waits for the road along
            # the track to grow, which comes late while the car is still yawed
            # into the bend. Out of the medium bends (v0.80: 1,544-1,591 m,
            # 3,000-3,015 m, 1,063 m) the car was already 6-40 km/h below the
            # plan, yet the inside target and its integral still held 0.3-0.4
            # of steering: 12-17 km/h of slide, traction control cutting, and
            # the outer half of the road unused. The plan's headroom (allowed
            # speed of the previous step minus the speed) says the bend no
            # longer limits the car: from run_head the inside target is let
            # go, fully at run_head + run_width, smoothed by run_lp.
            run= clip((getattr(c, 'allowed_speed', 0) - S['speedX'] - run_head)/run_width, 0, 1)
            c.run= run_lp*getattr(c, 'run', 0) + (1-run_lp)*run
            phase*= 1 - c.run
        else:
            c.run= 0
        line_target= offset*phase*side
        R['steer']+= (line_target - S['trackPos'])*line_gain
    # Inside line integral: in a steady bend the heading term (angle*15/PI)
    # pushes back on the line term, because the body is yawed by the slip
    # angle (v0.52, ~2,655-2,760 m: angle -0.035 rad = vy/vx, -0.17 steer),
    # so the car held trackPos 0.23 against an inside target of 0.81 for
    # 100 m. The remaining error is integrated (steer per second per unit
    # of trackPos), only on the inside half of a bend (phase < 0, where the
    # line gains time) and faded out with |steer| like the apex extra (none
    # near full lock). Elsewhere it fades by line_idecay per step: an
    # integral carried through the outside phase or out of a bend ran the
    # flick approach off the track (v0.53 trials, 9-10 of 30 off).
    fi= 0
    if side != 0 and phase < 0:
        fi= clip((line_isteer+line_ifade-abs(prev_steer))/line_ifade, 0, 1)
    c.line_i= clip(getattr(c, 'line_i', 0)*(line_idecay + (1-line_idecay)*fi)
                   + (line_target - S['trackPos'])*.021*line_ki*fi, -line_imax, line_imax)
    R['steer']+= c.line_i
    c.line_side= side   # kept between steps
    c.aim, c.line_target, c.ahead= aim, line_target, ahead   # kept for telemetry only
    # Steering Cap At Speed (v0.94): above ~100 km/h the front tyres are past
    # their grip well before full lock. At bend detection under braking the
    # line term stepped the wheel to 0.63-0.78 (392 m at 156 km/h, 721 m at
    # 170, 987 m at 194), and the 450 m bend was held at 0.64-0.68 for 80 m
    # with the car still drifting to the outside half: more lock there only
    # scrubs, fades the sharpness plan's credit (turn_steer_fade from 0.61)
    # and limits the throttle (lock_steer 0.6). So |steer| is capped at
    # steer_cap from steer_cap_v0 + steer_cap_vw; below steer_cap_v0 full lock
    # stays (hairpin 56 km/h, the flick's arcs 62-85).
    cap= 1 - (1-steer_cap)*clip((S['speedX']-steer_cap_v0)/steer_cap_vw, 0, 1)
    R['steer']= clip(R['steer'], -cap, cap)
    # Steering Rate Limit: a sudden jump in the beams (e.g. at a direction change)
    # cannot snap the wheel; it moves at most max_steer_step per step.
    R['steer']= clip(R['steer'], prev_steer-max_steer_step, prev_steer+max_steer_step)

    # Brake Planning: fastest speed from which the car can still slow to
    # corner_speed within the road visible straight ahead. The car slows harder
    # at speed (drag and downforce: per unit of pedal ~50-55 m/s^2 below
    # 160 km/h, 60-72 at 180-220 in v0.36-v0.39), so the plan assumes
    # brake_decel + brake_aero*v^2. Slowing from v to v0 over d metres then
    # gives v^2 = ((a + c*v0^2)*exp(2*c*d) - a)/c, which is v0^2 + 2ad when c = 0.
    # Measured on v0.46-v0.47 laps, the car slows at ~19 m/s^2 at 100 km/h,
    # ~24-26 at 140-160 and only ~27-30 at 200-240, so a larger brake_aero
    # fits the middle speeds but would claim 40+ m/s^2 at 240 km/h: the plan
    # is capped at brake_max. Above brake_max the slowing is constant:
    # v^2 = v_cap^2 + 2*brake_max*(d - d_cap), with v_cap where the curve meets
    # the cap and d_cap = ln(brake_max/(a + c*v0^2))/(2c) the distance below it.
    # Crests (the flick approach, ~2,364-2,433 m) unload the tyres: the
    # mechanical part brake_decel is scaled by the load 1 + a_z/g, from the
    # change of speedZ (km/h per ~21 ms step, smoothed), between a floor and 1.
    # Load Floor By Speed (v0.91): the load read on a crest is applied to the
    # whole braking distance, but the crest lasts 20-50 m. At speed, with
    # 45-100 m of road in view, a floor of 0.5 took ~10 km/h off the plan for
    # a moment (v0.90: full brake 275 -> 253 km/h at 2,287-2,297 m with the
    # load at 0.63-0.68, now pedal 0.35-0.67 to 259; a 0.3 brake at 191 km/h
    # at 2,600 m after the Corkscrew with the load at 0.28, now a two-step
    # lift). Close to a slow corner the unloaded stretch is most
    # of what is left (flick turn-in, 2,431-2,438 m at 110 km/h: load 0.36-
    # 0.69), and a higher floor there is paid at the flick's left arc
    # (brake_load_min 0.7 everywhere: arc entry 82 -> 89 km/h). So the floor
    # is brake_load_min up to brake_load_v0 and rises to brake_load_fast over
    # brake_load_vw.
    from math import exp, log
    v_corner= corner_speed/3.6
    vz= S['speedZ']; az= (vz - getattr(c, 'vz_prev', vz))/3.6/.021; c.vz_prev= vz
    c.az= .7*getattr(c, 'az', 0) + .3*az   # m/s^2, smoothed
    load_floor= brake_load_min + (brake_load_fast-brake_load_min)*clip((S['speedX']-brake_load_v0)/brake_load_vw, 0, 1)
    a_mech= brake_decel*clip(1 + c.az/9.81, load_floor, 1)
    # Higher Cap Up To A Speed (v0.95): the cap of 30 m/s^2 was measured on
    # laps where the pedal was ~0.65 (pedal = brake_gain * excess over the
    # plan, and the plan never asked for more). At full pedal the car slows
    # at 39-43 m/s^2 from 160 to 280 km/h (v0.94 with brake_gain 0.2, ABS on
    # or off), so the plan above ~187 km/h was braking earlier than needed.
    # With the cap at 34 everywhere the lap is 0.07 s faster over 29 perturbed
    # laps, but the flick approach leaves the track (turn_grip_aero +): there
    # the pedal is saturated and ABS-cut for 70 m (crest, kink at |steer| 0.62)
    # and the arc entry speed is set by the plan's early dips at 2,290 and
    # 2,333 m (250 km/h with 54 m in view), which a higher cap removes. So the
    # higher cap counts only up to brake_hi_v: allowed = min(plan at
    # brake_max_hi, max(plan at brake_max, brake_hi_v)).
    def brake_dist_speed(d, a_max):   # m/s from which the car can slow to v_corner in d metres, planning at most a_max
        d= max(0, d-brake_margin)
        a0= a_mech + brake_aero*v_corner**2   # planned deceleration at v_corner
        if a0 >= a_max: return (v_corner**2 + 2*a_max*d)**.5
        d_cap= log(a_max/a0)/(2*brake_aero)
        if d <= d_cap: return ((a0*exp(2*brake_aero*d) - a_mech)/brake_aero)**.5
        return ((a_max - a_mech)/brake_aero + 2*a_max*(d - d_cap))**.5
    def brake_speed(d):
        return min(brake_dist_speed(d, brake_max_hi), max(brake_dist_speed(d, brake_max), brake_hi_v/3.6))
    allowed_speed= brake_speed(ahead) * 3.6
    # Corner Speed From Sharpness: the car may also go as fast as it could
    # follow any beam: able to slow to corner_speed within that beam's length
    # (as above), and able to curve onto it -- reaching a point d metres away at
    # angle a needs a radius of d/(2 sin a), taken at turn_grip sideways. That
    # curve passes bearing p at 2*radius*sin(p), so every beam between the nose
    # and this one must reach at least that far, or the curve leaves the track.
    # Wide bends show long beams at moderate angles (more speed); hairpins only
    # short beams at wide angles. Not used near full lock (|steer| above
    # turn_steer_max). Never less than the plan from the road ahead.
    # Grip rises with speed (downforce; braking per unit of pedal is ~40% higher
    # at 210 km/h than at 80), so the sideways acceleration assumed is
    # turn_grip*(1 + turn_grip_aero*v^2); at the speed that just follows the
    # curve, v^2 = turn_grip*radius*(1 + turn_grip_aero*v^2), which gives
    # v^2 = turn_grip*radius/(1 - turn_grip*turn_grip_aero*radius).
    # The credit above the road-ahead plan fades out with |steer| instead of
    # switching off at one value: an on/off switch at 0.6 turned a one-step
    # steering spike at a corner exit into a full brake (v0.46: ~513 m, the
    # -19 deg beam opening), and a hard switch higher up (0.65-0.7) ran wide
    # at the flick. Full credit up to turn_steer_max - turn_steer_fade, none
    # from turn_steer_max.
    # The |steer| that fades the credit is smoothed (fade_lp per step, ~0.2 s):
    # in steady medium corners the steering jitters 0.5-0.62 step to step, and
    # the raw value swung the allowed speed by 10-18 km/h within 50 m (v0.55,
    # ~400-520 m: 97-115 km/h), a brake/throttle sawtooth (brake 0.1-0.3, then
    # the stored throttle climbs back from 0). v0.57 trials: smoothing alone
    # -0.05 s over 30 perturbed laps, with the window co-tuned -0.15 s.
    from math import sin
    road_plan= sharp= allowed_speed
    c.steer_f= fade_lp*getattr(c, 'steer_f', abs(R['steer'])) + (1-fade_lp)*abs(R['steer'])
    # Grip To Spare (v0.60): in the steady medium bends (1,520 m, 2,977 m) the
    # car rode exactly on this plan at only |steer| 0.15-0.3 and 5-9 km/h of
    # slide (v0.59): the tyres were not at their limit, the assumed grip was.
    # So while the smoothed |steer| is light the plan assumes grip_boost more
    # grip, fading out from boost_steer over boost_fade; near the limit
    # (hairpin, flick, 448 m at |steer| 0.5-0.7) nothing changes, and as the
    # extra speed asks for more steering the extra fades: self-limiting.
    tg= turn_grip*(1 + grip_boost*clip((boost_steer+boost_fade-c.steer_f)/boost_fade, 0, 1))
    # Slip Reference: the curve onto a beam starts along the direction the
    # car travels, not along its nose. In a bend the nose points inside the
    # direction of travel by the slip angle (medium bends: 6-16 km/h of
    # sideways speed at 120-150 km/h = 2.5-7 deg, against a binding beam at
    # 7 deg), so the arc to an inside beam is tighter than its nose angle
    # says. The beam angles are shifted by slip_ref of the slip angle: a
    # sliding car is allowed less speed, a car that grips more (turn_grip
    # 7 -> 8). Beams within 0.25 deg of the shifted zero are skipped.
    from math import atan2
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
    c.allowed_speed= allowed_speed   # kept for telemetry and for the next step's exit run-out (v0.81)

    # Throttle Control
    if S['speedX'] < min(target_speed - (abs(R['steer'])*50), allowed_speed):
        R['accel']+= .05
        # Throttle Floor: the simulator's engine (simuv2 engine.cpp) gives
        # Tmax*(throttle*(1 + k) - k), k = 0.33*(rpm - 5,000 tickover)/(20,000
        # - 5,000): below throttle k/(1 + k) it brakes the rear wheels (0.13 at
        # 12,000 rpm, 0.21 at 17,000). After every brake application the stored
        # throttle restarted from 0 at +0.05 per step, so the first 3-5 steps
        # (~0.1 s) of each of the lap's ~36 restarts were still engine braking
        # with the plan already asking for speed. So the ramp starts from the
        # zero-torque throttle instead (S['rpm'] as read, ~4.7 % high).
        eng_brk= .33*max(S['rpm']-5000, 0)/15000
        R['accel']= max(R['accel'], thr_zero*eng_brk/(1+eng_brk))
    else:
        R['accel']-= .01
    if S['speedX']<10:
       R['accel']+= 1/(S['speedX']+.1)

    # Brake Control
    # Lift Band: in steady medium corners the car rides the plan, and every
    # brake touch 0.5-1 km/h over it zeroed the stored throttle, which then
    # climbed back at +0.05 per step (v0.50: a ~0.3 s brake/throttle sawtooth,
    # ~141-144 km/h at ~2,670-2,740 m). So up to lift_pct % of the speed over
    # the allowed speed the car only lifts: throttle 0 this step, no brake, and
    # the stored throttle is kept (the -0.01 above is undone). Beyond the band
    # it brakes for the excess over the band. Faded in from lift_v0 over
    # lift_vw km/h: the slow corners (hairpin, Corkscrew) brake at once.
    # Full Pedal Beyond The Band (v0.93): until v0.92 the band was also taken
    # off the brake pedal (pedal for the excess over the band), so every big
    # braking zone ran the band's width above the plan (1 % = 2.2 km/h at 220
    # km/h = 0.11 of pedal less all the way down), and a wider band spent the
    # flick and hairpin margin (band 2.5-3.5 %: 1-2 of 40 off on the shifted
    # bases). Now the pedal is for the whole excess over the allowed speed
    # once the car is beyond the band: braking zones follow the plan itself
    # (suite max |trackPos| 0.851 -> 0.802), and the band can be 3.5 %, so the
    # car riding the plan in a bend lifts instead of touching the brake.
    lift_band= lift_pct/100*S['speedX']*clip((S['speedX']-lift_v0)/lift_vw, 0, 1)
    lift= False
    dab= False
    R['brake']= 0
    if ahead >= 0 and S['speedX'] > allowed_speed + lift_band:
        R['brake']= min(1, (S['speedX']-allowed_speed)*brake_gain)
        # Brake Touch (v0.64): in medium corners the car rides the plan and a
        # 1-3 km/h excess gives a 0.05-0.15 brake touch, which zeroed the stored
        # throttle; it then climbed back at +0.05 per step (~0.3 s at part
        # throttle: v0.63, 448 m bend, 100-112 km/h sawtooth). A touch lighter
        # than touch_brake keeps touch_keep of it; nothing is sent while braking.
        # Brake Dab (v1.01): at the flat-out left kink after the start (160-190 m,
        # 219-229 km/h) the plan is the braking distance on one beam and dips
        # under the car's speed for one step when the -12 deg beam closes on
        # the inside edge again (allowed 233 -> 214 -> 220 km/h). The one-step
        # brake (pedal 0.4-0.5, above touch_brake) took ~1 km/h, but it zeroed
        # the stored throttle, which then climbed back from its floor at +0.05
        # per step: 8-9 km/h lost by 175 m and carried to the 450 m braking
        # (18 of 70 perturbed runs, 0.16 s each). A brake application is not
        # known to be a braking zone until it lasts: for its first dab_n steps
        # the stored throttle is kept (dab_keep per step), with the wheel near
        # straight and below dab_v.
        c.brk_n= getattr(c, 'brk_n', 0) + 1   # steps of this brake application
        dab= c.brk_n <= dab_n and c.steer_f < dab_steer and S['speedX'] < dab_v
        touch_thr= R['accel']*(dab_keep if dab else touch_keep*(R['brake'] < touch_brake))
        R['accel']= 0
    elif ahead >= 0 and S['speedX'] > allowed_speed:
        c.brk_n= 0
        lift= True
        R['accel']= max(R['accel']+.01, 0)   # stored throttle kept; the throttle sent is 0 (end of drive_example)

    # ABS: cut the brake to abs_cut once any wheel turns below abs_ratio of the
    # car speed (locking). v0.55: from 0.8 to 0.85 the cut starts earlier; the
    # big braking zones were lock-limited (pedal ~0.4-0.5 after the cut) and
    # releasing sooner keeps the tyres nearer their peak (3x10 suites -0.23 s).
    # v0.77: back to 0.8 together with a later braking plan (brake_aero .0065).
    # On the v0.76 car 0.78-0.83 costs no time and narrows the flick and hairpin
    # drift (suite max |trackPos| 0.889 -> 0.81-0.84); the later plan, which
    # left the track at 0.85 (1 of 30), spends that margin: 3x10 suites -0.12 s.
    if R['brake'] > 0 and S['speedX'] > 20:
        slowest_wheel= min(S['wheelSpinVel'])*.3   # rad/s * ~0.3 m wheel radius = m/s
        if slowest_wheel < abs_ratio*S['speedX']/3.6:
            R['brake']*= abs_cut

    # Throttle Near Full Lock: at full lock the car is already turning as tight
    # as it can, so more speed only pushes it wide (v0.28: throttle 1.0 at full
    # lock in the ~3,283 m hairpin ran the car out to trackPos -0.92). Above
    # lock_steer the throttle is limited, falling linearly to lock_throttle at
    # full lock. The stored throttle is limited too, so it cannot wind up and
    # snap open as the wheel straightens; it climbs back at +0.05 per step.
    lock= clip((abs(R['steer'])-lock_steer)/(1-lock_steer), 0, 1)   # 0 below lock_steer, 1 at full lock
    # The full-lock arc drifts outward (hairpin: trackPos +0.1 -> -0.78 at full
    # lock). Until v0.75 the limit fell with the room to the outside edge alone
    # (0.2 with 0.8 of room, 0 at 0.3), whatever the car was doing: 0.2 of drive
    # while it drifted out at 1 trackPos unit per second (flick left arc and
    # hairpin, widening the drift that sets the lap's margin), still 0.2 on the
    # flick's right arc with 1.8-1.0 of room, and nothing at the hairpin exit
    # for the ~5 steps after the drift had stopped at -0.77.
    # Time To The Edge (v0.76): the limit is set by how soon the car would
    # reach the outside edge at its present drift, room / outward rate of
    # trackPos (smoothed): none at lock_tte_near seconds or less, lock_throttle
    # at lock_tte_far, on the same line up to lock_throttle_max once the drift
    # stops or the edge is far. Outside = right in a left turn (steer +), left
    # in a right turn.
    out_side= 1 if R['steer'] > 0 else -1
    room= 1 + out_side*S['trackPos']   # trackPos units to the outside edge
    out_rate= -out_side*(S['trackPos'] - getattr(c, 'tp_prev', S['trackPos']))/.021   # units per second toward that edge
    c.tp_prev= S['trackPos']
    c.out_rate= .7*getattr(c, 'out_rate', 0) + .3*out_rate   # smoothed
    tte= room/max(c.out_rate, .05)   # s to the outside edge
    lt= clip(lock_throttle*(tte-lock_tte_near)/(lock_tte_far-lock_tte_near), 0, lock_throttle_max)
    R['accel']= min(R['accel'], 1 - lock*(1-lt))

    # Traction Control: how much faster the rear (driven) wheels' surface moves
    # than the fronts', in m/s (tyre radii from car1-ow1.xml), so the limit does
    # not change with speed. Measured on our laps, acceleration peaks at 2-2.5
    # m/s of over-speed and the car starts to slide sideways above ~2.5, so
    # beyond tc_slip the throttle sent is cut in proportion. The cut is not
    # kept: next step starts from the throttle before it (c.throttle), so a
    # burst of wheelspin does not cost a slow climb back at +0.05 per step.
    # But a cut released at once lets the throttle snap back to the same
    # value, the rear spins again, and under sustained spin the throttle sent
    # chatters 0 <-> 1 (v0.38: ~20 steps on the Corkscrew exit, 25.7 km/h
    # sideways). So the cut fades out: at least tc_hold of last step's cut
    # stays, and it lasts a few steps after the spin stops.
    # The 2.5 m/s limit was measured with the car turning; on a straight exit
    # the rear tyres carry no sideways load and pull harder with more slip
    # (v0.43 trials: a flat 3.5-6 m/s was 0.7-1.0 s faster, but let the flick
    # slide reach 25-36 km/h). So the limit rises by up to tc_slip_straight
    # as the wheel straightens: full extra at steer 0, none from tc_slip_steer.
    # A car that slides is counter-steering toward 0, which would raise the
    # limit and feed the slide (19 km/h at ~500 m without this), so the extra
    # also fades out with sideways speed, gone at tc_slip_slide. That is set
    # above the 7-11 km/h every medium corner's exit runs at anyway (v0.45: 14;
    # v0.49: 20, faster over three 10-run suites with no wider flick).
    w= S['wheelSpinVel']
    rear_over= (w[2]+w[3])/2*.315 - (w[0]+w[1])/2*.302
    slip_target= tc_slip + tc_slip_straight*clip(1-abs(R['steer'])/tc_slip_steer, 0, 1)*clip(1-abs(S['speedY'])/tc_slip_slide, 0, 1)
    # Slip Ratio: the simulator's tyre force (simuv2 wheel.cpp) depends on the
    # slip ratio, over-speed / car speed, combined with the sideways slip:
    # s = sqrt(sx^2 + sy^2), force flat from s ~0.15 (peak 0.2), shared between
    # drive and cornering as sx/s and sy/s. A limit in m/s was 0.27 of the speed
    # at 60 km/h (hairpin and Corkscrew exits: all the rear grip spent on drive,
    # exit slides 12 km/h) and 0.11 at 150 km/h. So the limit is scaled with
    # the speed, equal to the old one at tc_vref.
    slip_target*= S['speedX']/tc_vref
    # Launch (v0.71): the lap is timed from a standing start, where the engine
    # sits far below its 16-18k torque peak in 1st-3rd gear; wheelspin lets it
    # rev into that peak like a slipping clutch. With traction control on, the
    # throttle cycled 1.0 -> 0.2 every ~7 steps (rear over-speed 1 <-> 10 m/s).
    # Without the cut the car reaches 100 m ~0.18 s sooner. Latched off for the
    # rest of the run once launch_v is first reached.
    c.launch= getattr(c, 'launch', True) and S['speedX'] < launch_v
    if c.launch: slip_target+= launch_slip
    # Straight Exits (v0.72): out of the hairpin (57 km/h, 2nd gear at ~6,800
    # rpm, far below the 16-18k torque peak) and the Corkscrew the car runs
    # straight, yet traction control cut the throttle by 0.15-0.3 for ~100 m
    # (rear over-speed beyond the 9.5 m/s straight limit): the same state as
    # the standing start. So below launch_v the launch allowance applies again,
    # faded out with |steer| (none from exit_steer) and sideways speed (none
    # from exit_vy): only while the car is straight and not sliding.
    elif S['speedX'] < launch_v:
        slip_target+= launch_slip*clip(1-abs(R['steer'])/exit_steer, 0, 1)*clip(1-abs(S['speedY'])/exit_vy, 0, 1)
    c.throttle= clip(R['accel'], 0, 1)
    c.tc_cut= max(clip((rear_over-slip_target)*tc_gain, 0, 1), getattr(c, 'tc_cut', 0)*tc_hold)
    R['accel']= c.throttle - c.tc_cut
    if R['brake'] == 0 and not lift: c.brk_n= 0
    if 0 < R['brake'] < touch_brake or (dab and R['brake'] > 0):   # brake touch or dab: stored throttle kept, nothing sent
        c.throttle= min(c.throttle + touch_thr, 1); R['accel']= 0
    if lift: R['accel']= 0   # lift band: nothing sent, c.throttle stays for the next step

    # Clutch Slip (v0.78): out of slow corners and at the start the gear puts
    # the engine far below its 16-18k torque peak (hairpin exit: 2nd at ~6,800
    # rpm; after each upshift ~10-13k), and the car accelerated only by
    # spinning the rear wheels up (v0.71/v0.72). With the clutch partly pressed
    # the engine revs up toward the peak on its own and TORCS still passes its
    # full torque to the wheels (v0.78 trials: pedal 0.5-0.7 gains 0.1-0.28 s
    # over 30 perturbed laps, 0.8 loses drive: 76.163). So while accelerating, the
    # clutch is slipped whenever the rpm the gear gives at the car's speed
    # (ground rpm: speed / rear radius 0.315 m * gear ratio * final drive 4.5)
    # was below clutch_rpm 14,000, fading in over clutch_fade 2,000 (both removed
    # in v0.79, see below).
    # Slip In Every Gear (v0.79): v0.78 slipped only below 14,000 ground rpm, on
    # the idea that the gain was the torque peak. The simulator's source
    # (simuv2 engine.cpp/transmission.cpp) says otherwise: the torque curve is
    # nearly flat (340-360 N.m from 9,000 to 18,000 rpm); the torque passed is
    # engine torque * min(3*(1 - pedal), 1), so all of it up to pedal 2/3 (0.9 of
    # it at the old 0.7); the engine speed follows the wheels only by
    # (1 - pedal)^4 per simulation step; and above the 18,700 limiter the engine
    # torque is 0. So the slip is useful in every gear, as long as the engine
    # stays under the limiter: the pedal eases off as the driven wheels' rpm
    # (rear wheel speed * gear ratio * final drive) nears clutch_top, with the
    # coupling (1 - pedal)^4 = clutch_k/(clutch_top - wheel rpm + clutch_k).
    # The engine rpm is then no longer the gear's rpm, so the upshift reads the
    # driven wheels' rpm instead (same value when the clutch is closed).
    axle_rpm= (w[2]+w[3])/2*[3.9, 2.9, 2.3, 1.87, 1.68, 1.54][max(int(S['gear']), 1)-1]*4.5*60/(2*PI)
    R['clutch']= 0
    if R['brake'] == 0 and c.throttle > 0 and axle_rpm < clutch_top:
        R['clutch']= min(clutch_slip, 1 - (clutch_k/(clutch_top-axle_rpm+clutch_k))**.25)

    # Automatic Transmission: shift up when the driven wheels' rpm (axle_rpm) passes upshift_rpm;
    # shift down only when the lower gear would land the engine rpm below downshift_rpm, and
    # never below lowest_running_gear: 1st gear's engine braking makes the rear
    # step out in slow corners, so 1st is used only to start (below 10 km/h).
    # Braking Downshift (v0.86): the brake pedal saturates at 20 km/h over the
    # allowed speed and ABS halves it whenever one wheel is slow, so on the
    # flick approach (2,366-2,436 m: crest, right kink at |steer| 0.7-0.9) the
    # car sat at pedal 0.5 for 70 m, 20-50 km/h over the plan, with nothing
    # left to ask for; it reached the left arc at 100-104 km/h and full lock.
    # The engine brakes the rear wheels by k/(1 + k) of its torque off the
    # throttle, k = 0.33*(rpm - 5,000)/15,000 (simuv2 engine.cpp), times the
    # gear ratio: a gear lower at 17,000 rpm instead of 13,000 is ~1.5-2 m/s^2
    # more deceleration that the ABS cut does not touch. So while the car is
    # more than brake_ds_over above the plan under braking, the downshift
    # comes as soon as the lower gear lands below brake_ds_rpm. Ungated (any
    # braking) it costs 0.16 s over 30 perturbed laps: every braking zone and
    # brake touch then ends a gear too low.
    gear_ratios= [3.9, 2.9, 2.3, 1.87, 1.68, 1.54]   # gears 1-6, from car1-ow1.xml
    gear= int(S['gear'])
    if gear < 1 or S['speedX'] < 10:
        gear= 1
    elif gear < 6 and axle_rpm > upshift_rpm:
        gear+= 1
    elif (gear > lowest_running_gear and (getattr(c, 'up_t', 99) >= upshift_hold or R['brake'] > 0)
          and S['rpm']*gear_ratios[gear-2]/gear_ratios[gear-1] < (brake_ds_rpm if R['brake'] > 0 and S['speedX']-allowed_speed > brake_ds_over else downshift_rpm)):
        gear-= 1
    # First Gear At Full Lock (v0.90): at full lock (hairpin, the flick's left
    # arc) the front tyres are saturated and the car drifts to the outside edge
    # off the throttle; how far is set by the speed it arrives with (hairpin
    # exit |trackPos| 0.66 / 0.76 / 0.91 / 1.29 at brake_margin 15 / 14 / 13 /
    # 12). More brake pedal there is worse (it loads the fronts further), less
    # is worse too (more speed). First gear brakes the rear wheels only
    # (off-throttle engine torque * 3.9 instead of 2.9, at ~11,000 rpm instead
    # of ~8,000: ~2 m/s^2 more), which slows the car and turns it in. The
    # exit is still driven in 2nd: back up once the wheel unwinds.
    if S['speedX'] > 10 and not c.launch:
        if gear == 2 and abs(R['steer']) > lock_gear_on and S['speedX'] < lock_gear_v: gear= 1
        elif gear == 1 and abs(R['steer']) < lock_gear_off: gear= 2
    c.up_t= 0 if gear > int(S['gear']) else getattr(c, 'up_t', 99) + 1   # steps since the last upshift
    R['gear']= gear
    # Upshift Clutch (v0.92): for the shift time (0.05 s, car1-ow1.xml) after a
    # gear change the simulator (simuv2 transmission.cpp) opens the clutch
    # itself and caps the throttle at 0.1 whenever the clutch pedal is below
    # 0.01. On the upshift step the pedal above was worked out from the old
    # gear's wheel rpm (0 at the top of the gear), so every upshift lost a step
    # of drive (3rd -> 4th: +0.1 km/h in that step instead of +0.7), and on the
    # next steps the closing clutch pulled the engine from ~18,500 down to the
    # new gear's ~15,000 rpm at once. Holding the pedal at clutch_slip (full
    # engine torque still passed) for the shift time keeps the drive on and
    # the engine up; the slip law above then eases the clutch shut as before.
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
    run_dir= os.path.join(os.path.dirname(os.path.abspath(__file__)), 'runs')
    os.makedirs(run_dir, exist_ok=True)
    log_path= os.path.join(run_dir, time.strftime('run_%Y%m%d_%H%M%S.csv'))
    log= open(log_path, 'w', buffering=1)  # line-buffered: rows survive Ctrl-C.
    log.write('step,curLapTime,lastLapTime,distFromStart,speedX,speedY,gear,rpm,'
              'accel,brake,steer,trackPos,angle,ahead,rearSpin,damage,aim,lineTarget,aheadPlan,allowed,throttle,' +
              ','.join('track%d' % i for i in range(19)) + '\n')  # track0-18: beams at TRACK_ANGLES
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
        log.write('%d,%.3f,%.3f,%.1f,%.1f,%.1f,%d,%.0f,%.3f,%.3f,%.3f,%.3f,%.3f,%.1f,%.1f,%.0f,%.2f,%.3f,%.1f,%.1f,%.3f,%s\n' % (
            C.maxSteps-step, S['curLapTime'], S['lastLapTime'], S['distFromStart'],
            S['speedX'], S['speedY'], S['gear'], S['rpm'], R['accel'], R['brake'],
            R['steer'], S['trackPos'], S['angle'], max(S['track'][8:11]),
            (w[2]+w[3])-(w[0]+w[1]), S['damage'], C.aim, C.line_target, C.ahead, C.allowed_speed, C.throttle,
            ','.join('%.1f' % d for d in S['track'])))
    log.close()
    C.shutdown()
