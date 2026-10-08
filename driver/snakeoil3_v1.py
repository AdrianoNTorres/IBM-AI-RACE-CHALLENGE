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
    brake_hi_v=235    # km/h: ... above this allowed speed the plan stays on brake_max (the flick approach, 245-275 km/h over a crest into the kink, is pedal-limited and ABS-cut and relies on the early dips of the brake_max plan; 245: 2 of 30 off) ...
    brake_hi_car=245  # km/h: v1.05: ... but only while the car itself is below this speed: above it brake_max_hi counts everywhere (since v1.04 the S-bend look sets the flick's arrival speed, not the plan's early dips; with no gate at all the start kink, 219-236 km/h, brakes one step more on 32 of 70 runs; 240 / 250 measure the same; 999 = off, drives as v1.04).
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
    downshift_rpm=15000 # shift down only if the lower gear would land below this (v0.54: keeps the engine near its 16-18k torque peak; v1.22, re-measured: 16,000 / 16,500 / 17,000 / 17,500 / 18,000 / 18,500: 0.09 / 0.13 / 0.22 / 0.25 / 0.27 / 0.27 s gained on 12 runs, but from 16,500 the gear comes while the car coasts into the 2,700 m bend and its exit goes from 0.67 to 0.85-0.88 of the edge, 446 m from 0.65 to 0.71-0.75; 16,000 on top of drive_ds_rpm below: 0.268 s over 70 runs, but 0.911 of the edge at 441 m with the stored speed read 5 m early, for 0.876, and 0.854 at 2,803 m on the suites).
    # Gear For The Exit (v1.22). The engine's torque is flat (340-360 N.m from 9,000 to 18,000 rpm), so the thrust at
    # the wheels goes with the gear ratio: 3rd pulls 23 % harder than 4th, 2nd 26 % harder than 3rd, whatever the rpm.
    # With downshift_rpm alone the car left the fast bends a gear too high: 185 km/h in 4th at 13,100 rpm out of the
    # 2,988 m bend (3rd runs to 215), 180 in 4th out of 2,700 m, 201 in 4th out of 1,931 m. On the throttle (no
    # brake) the car now shifts down as soon as the lower gear would land below drive_ds_rpm (the engine's rpm
    # reading, 4.7 % high: 19,000 read = 18,150; the upshift comes at 18,600 on the driven wheels), not sooner than
    # drive_ds_wait steps after the last shift (the rpm reading dips while the clutch closes: without the wait the car
    # went 4-3-2 at 179 km/h in the 2,700 m bend). Under braking and while coasting nothing changes: the entries are
    # driven as before. 17,500 / 18,000 / 18,500 / 19,000 / 19,500: 0.12 / 0.12 / 0.16 / 0.16 / 0.15 s gained on 12
    # runs. Judged on the driven wheels' rpm instead (like the upshift): the gears hunt
    # 2-3-2-3 on the wheelspin out of the hairpin and at the start. Without the throttle condition (any step with no
    # brake): no faster, and the 2,700 m exit goes to 0.87-0.88.
    drive_ds_rpm=19000  # on the throttle, shift down as soon as the lower gear would land below this (0 or downshift_rpm = off; 70 runs: 0.197 s gained, SE 0.011, 70 of 70 faster; the 2,700 m exit 0.67 -> 0.85 of the edge at most, 0.853 at 18,000-20,000 on 80 runs; nothing else moves)
    # Gear Into The Bend (v1.23). Raising downshift_rpm everywhere (v1.22's alternative) was 0.07 s faster but spent
    # margin. Measured place by place: the earlier downshift under braking turns the car in harder (engine braking on
    # the rear wheels), so it runs 0.07-0.10 inside the line at the apex: a shorter path, paid for at the inside edge
    # (770 m 0.837 -> 0.903 and 1,528 m 0.862 -> 0.900 with the stored speed read 5 / 10 m early; 1,931 m 0.832 ->
    # 0.852; the 2,700 m exit 0.827 -> 0.873; hairpin slower). Kept only where the margin does not move: the upper
    # gears on the straight part of the braking for 446 m (to 385 m: 0.889 -> 0.863 read 5 m early), the flick
    # approach and 2,988 m. The same threshold gated on |steer| < 0.05 / 0.10 / 0.15 instead of places: 0.04 / 0.08 /
    # 0.13 s, but 0.906 at 767 m and 0.894-0.899 at 1,527 m with the stored speed read early.
    entry_ds_rpm=19000  # braking or coasting inside entry_ds_zones, shift down as soon as the lower gear would land below this (rpm reading; downshift_rpm or less = off; 12 runs: 17,000 / 18,000 / 18,500 / 19,000 / 19,500: 0.06 / 0.05 / 0.05 / 0.08 / 0.07 s)
    entry_ds_zones= ((340, 385), (2320, 2420), (2950, 3000))   # from m, to m: braking for 446 m (5th -> 4th -> 3rd only), the flick approach, 2,988 m
    drive_ds_wait=5     # steps since the last shift before that downshift (15: the same to 0.007 s)
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
    launch_v=160        # km/h: standing start (v0.71; v0.69 rejected at corner_speed 79): until the car first reaches this speed ... (v1.21: 130 -> 160. At 130 the rear wheels were still 15-20 m/s over the car in 3rd gear and the car was steering across the track, so traction control cut the throttle to 0.74, the wheels hooked up at once and the engine fell to 14,700 rpm, under its 16-18k peak; left alone they hook up by themselves at 142-147 km/h with the engine at 16,300 rpm. 135 / 140 / 160 / 250: the same lap, 0.079 s sooner at 280 m, 263.4 for 262.2 km/h there; 0.075 s on 12 runs. Holding 1st and 2nd gear during the launch instead: 0.03-0.05 s slower than that; launch_slip 8 / 12 / 18 / 35 with it: +0.09 / +0.06 / +0.03 / 0.00 s at 280 m)
    launch_slip=25      # m/s: ... this much more rear over-speed is allowed before traction control cuts (in practice no cut).
    exit_steer=.3       # v0.72: below exit_v after the launch, launch_slip also applies while the car runs straight (out of the hairpin and the Corkscrew), full at steer 0, none from this |steer| ...
    exit_vy=6           # ... and none from this sideways speed (km/h; no extra while the car slides).
    exit_v=130          # km/h: v1.21: the speed below which the straight-exit allowance above applies, its own knob now that launch_v is 160 (with 160 here too: 0.004 s less gain on 12 runs)
    clutch_slip=.667    # most clutch pedal while accelerating (v0.78: .7; v0.79: 2/3, the most at which TORCS still passes the full engine torque: min(3*(1 - pedal), 1)) ...
    clutch_top=17000    # ... v0.79: slipped in every gear while the rpm of the driven wheels (rear wheel speed * gear ratio * final drive) is below this ...
    clutch_k=60         # ... easing off toward it: pedal = 1 - (clutch_k/(clutch_top - wheel rpm + clutch_k))^(1/4) (rpm; larger = closed sooner).
    shift_steps=3       # v0.92: for this many steps from an upshift (the 0.05 s shift time = 2.5 steps) the clutch pedal is held at clutch_slip while accelerating (0 = off: TORCS then opens the clutch itself and caps the throttle at 0.1).
    sb_a=12             # v1.04: S-bend look with the focus sensors (5 extra beams 1 deg apart, aimed by the client, one reading per second): asked for when the longest track beam is at least this many deg off the nose and its outer neighbour is under half of it (a kink ahead) ...
    sb_v=200            # km/h: ... above this speed ...
    sb_steer=.3         # ... while the smoothed |steer| is below this; the look covers the 4 deg on the nose side of that beam.
    sb_fall=3           # m: the look shows a slow corner behind the kink when its ray nearest the nose is this much longer than the one at the beam (the far edge faces the car: the road turns back; flick approach 70 of 70 runs at 2,335-2,338 m, nowhere else in 534 looks) ...
    sb_x=25             # m: ... then the allowed speed is at most the braking distance to corner_speed over the look's longest ray less this, counted down by the distance driven (22: no gain, 28 / 32: gain with less margin or less gain) ...
    sb_hold=12          # ... for this many steps (0 = looks only, drives as v1.01; 25: |trackPos| 0.99).
    # v1.06: corner table (track memory, hand-written from our telemetry): km/h added to the braking plan's allowed speed
    # while distFromStart is inside a row. The sensors still make the plan; the table only says which corner this is.
    # Rows start before the braking point and end where the plan stops binding on the exit (v1.06: moving every row 20 m
    # earlier is 0.36 s slower, 20 m later gives up 0.19 s of the gain). v1.12: the rows of the four bends inside the planned line's zones (1,042 / 1,931 / 2,700 / 2,988 m) re-tuned on that line (v1.11: plan_zones; the offset is added after the line's speed cap) and ended 35-45 m later (starts and ends +-15 m: the same). Bends left at 0 because
    # every offset measured slower: start kink 150-215 m (-6 / +15 / +40), 446 m (+-4, +8; v1.12: +5: 0.04 s gained on 12 runs, +10: 1 of 12 off at 556 m), 770 m (+-4; v1.12: +5 / +10: 0.01 s gained / 0.01 slower), flick approach. 1,528 m (v1.12): +22 with a longer row 0.03 s slower on 12 runs.
    corner_table= (      # from m, to m, km/h
        ( 950, 1100, 50),   # 1,042 m right-hander (+4 / +8 / +10: 0.014 / 0.045 / 0.042 s gained; v1.12, on the planned line: +10 -> +50 and the row's end 1,065 -> 1,100 m: the car was at 164 km/h and |steer| 0.2 where the line carries 186; with the longer row +20 / +30 / +40 / +50 / +60 / +70: 0.12 / 0.18 / 0.25 / 0.29 / 0.37 / 0.29 s gained on 12 runs; +70: 0.945 of the edge at the exit, 1,100 m; +85: 12 of 12 off there; the row's end 1,085 m: 0.03 s less, 1,115 m the same)
        (1395, 1585, 16),   # 1,528 m left-hander (v1.06: flat from +4 to +14: later braking gained, given back mid-bend; v1.10, with the line table's row from the right and the turn table's row ending 1,458 m: +10 -> +16; +13 / +16 / +19: 0.07 / 0.08 / 0.07 s gained)
        (1835, 1990, 65),   # 1,931 m left-hander (v1.12, on the planned line: +29 -> +65 and the row's end 1,945 -> 1,990 m: the car was at 170 km/h and |steer| 0.2 where the line carries 202; with the longer row +53 / +61 / +69 / +79 / +89 / +99: 0.33 / 0.42 / 0.47 / 0.58 / 0.67 / 0.74 s gained on 12 runs, the car cuts inside the line at the apex: 0.78 / 0.78 / 0.81 / 0.85 / 0.89 / 0.91 of the edge at 1,931 m (+65: 0.80 over 70 runs); +109: 5 of 12 off there; with the row ending 1,945 m the sensor plan brakes at the exit as the offset ends: +69: 0.11 s gained only; ends 1,975 / 2,005 m the same. Before: v1.06, on the old line: +8 / +14 / +17 / +20: 0.07 / 0.09-0.13 / 0.11 / 0.10 s, +28 left the track at 1,959 m; v1.09, on v1.07's line from the right and v1.08's turn-in, with the turn table's row ending 1,888 m: +17 -> +29; +26 / +29 / +32: 0.09 / 0.11 / 0.11-0.12 s gained, worst exit 0.62 / 0.67 / 0.70 of the edge; +35: 3 of 70 off at 1,975-1,978 m)
        (2585, 2648, 36),   # 2,600 m, downhill out of the Corkscrew: the car lifted on the plan at 192-200 km/h (v1.12, on the planned line: +12 -> +36 with the next row; +36 / +44 with it: 0.20 / 0.21 s gained on 12 runs)
        (2648, 2800, 41),   # 2,700 m left-hander (v1.12, on the planned line: +17 -> +41 and the row's end 2,760 -> 2,800 m; this row alone with the longer end +17 / +25 / +33 / +41 / +49 / +62: 0.04 / 0.09 / 0.13 / 0.13 / 0.10 / 0.00 s gained on 12 runs; +62: 0.925 of the edge at the exit, 2,801 m; ends 2,785 / 2,815 m the same)
        (2880, 3050, 52),   # 2,988 m right-hander (v1.12, on the planned line: +20 -> +52 and the row's end 3,005 -> 3,050 m; with the longer row +20 / +28 / +36 / +44 / +52 / +65: 0.07 / 0.14 / 0.23 / 0.30 / 0.36 / 0.36 s gained on 12 runs; exit at 3,053 m: 0.75 of the edge at +52, 0.80 at +60, 0.85 at +65; ends 3,035 / 3,065 m the same. Before: v1.06: +8 / +14 / +20: 0.06 / 0.13 / 0.13 s; v1.10, with the line table's row from the left and the turn table's row ending 2,926 m: +17 -> +20; +17 / +20 / +23 / +26: 0.06 / 0.07 / 0.05 / 0.00 s gained)
        (3175, 3275, 2),   # hairpin: slower in (+3: 0.95-0.96 of the edge at the exit, 1 of 70 off; -3: exit 0.90 -> 0.77, no time lost; v1.08: -9 with the turn table's row, one clean turn-in from the right at ~100 instead of ~115 km/h; -7 measures the same. v1.14, the hairpin on the planned line: -9 -> +2, now added to the line's speed cap, which binds through the hairpin; with the 0.65 line and the zone to 3,400 m -6 / -3 / 0 / +3 / +6 / +15: 0.14 / 0.21 / 0.29 / 0.36 / 0.27 s gained / 0.06 s slower with 0.93 of the edge at the exit on 12 runs (-9: 0.03 s gained on a single lap); with the 0.78 entry and exit +2 / +3 / +4: 0.417 / 0.428 / 0.433 s for 0.76 / 0.78 / 0.81 at the exit; a larger offset on the exit half only (+6 from 3,250 m): slower, 0.86)
    )
    # v1.07: line table (track memory, hand-written from our telemetry): on the approach to a corner the sensors
    # cannot see in time, the car is pulled toward this trackPos (+1 = left edge) with line_gain, by at most the row's
    # steer, while distFromStart is inside the row and no bend is detected. It replaces the sensor corner set-up there
    # (which starts only 60-70 m before the braking point and moved the car 0.2-0.3 of the half-width); the bend detection,
    # the turn-in and the line through the bend stay with the sensors. Rows measured slower and left out: 446 m
    # (+0.09 s), 770 m (+0.04), 1,528 m (+0.17), 2,988 m (+0.14), 1,042 m (0.00); a pull toward the inside before the
    # detection ("trail-in") is slower at all four medium bends.
    line_table= (        # from m, to m, trackPos, most steer
        (1260, 1464, -.7, .3),    # 1,528 m left-hander (v1.10): from the right (-0.45 at the turn-in, was -0.07); only with the corner table's +16 and the turn-in at 1,458 m (the row alone: 0.01 s); -.5 / -.9: 0.02 / 0.04 s less
        (1700, 1890, -.7, .3),    # 1,931 m left-hander: from the right (reaches -0.45 to -0.50 by 1,846 m); -.55 / -.85 and ends at 1,870 / 1,905 m gain 0.03-0.06 s less
        (2780, 2932, .7, .3),     # 2,988 m right-hander (v1.10): from the left; only with a turn-table row (without one: 0.42 s slower, the false start at 2,919 m throws the car back); .5 the same, .9: 0.04 s less
        (3020, 3240, -.85, .3),   # hairpin (left): from the right (reaches -0.57 at 3,196 m; the 2,988 m exit leaves the car on the left); -.7: 0.008 s less. Inert since v1.14: the planned line steers here
    )
    # v1.08: turn table (track memory, hand-written from our telemetry): while distFromStart is inside a row no bend
    # is detected, so the sensors' turn-in (bend detection from the look-ahead bearing) cannot come before the row's
    # end. Under braking the bearing first passes 2 deg 10-25 m early, the wheel steps to 0.4-0.6, the nose turns, the
    # bearing falls under 1 deg and the bend is dropped again (a "false start": 705-710, 968-974, 1,454-1,461,
    # 1,879-1,888 m; three times before the hairpin, which drifted the car from -0.57 back to the centre before the
    # real turn-in). The row ends where the turn-in should come; after it the sensors detect and steer as before.
    # Ends are sensitive on the early side (3-6 m earlier: 0.06-0.25 s slower, the false start is back) and flat for
    # ~3 m on the late side (6-12 m later: 0.08-0.18 s slower). Left out: 2,988 m (2,929 m: 0.016 s, +-3 m slower).
    turn_table= (        # from m, to m
        ( 690,  716),   # 770 m right-hander (712 / 719 m: no gain; 722 m: 0.08 s slower)
        ( 940,  982),   # 1,042 m right-hander (980 m: 0.06 s gained, 977 m: 0.25 s slower; 983 / 986 m: 0.03 gained / 0.09 slower)
        (1430, 1458),   # 1,528 m left-hander (v1.08, centre entry: 1,464 m, 1,461 m the same; 1,458 m: 0.11 s slower; 1,468 m: no gain. v1.10, entry from the right, corner row +16: 1,464 / 1,461 / 1,459 / 1,458 / 1,457 / 1,455 m: 0.03 / 0.06 / 0.08 / 0.08 / 0.08 / 0.04 s gained; 1,452 m: 0.08 s slower)
        (1850, 1888),   # 1,931 m left-hander (v1.08, corner row +17: 1,891 m, 1,888 m the same; 1,885 m: 0.06 s slower; 1,896 m: no gain. v1.09, corner row +29: 1,891 / 1,889 / 1,888 / 1,887 / 1,886 m: 0.08 / 0.10 / 0.11 / 0.11-0.13 / 0.12-0.13 s gained; 1,885 m: the false start is back, 0.97 of the edge at 1,964 m)
        (2900, 2926),   # 2,988 m right-hander (v1.10, entry from the left, corner row +20: 2,929 / 2,928 / 2,926 / 2,924 m: 0.04 / 0.05 / 0.06-0.07 / 0.07-0.08 s gained; 2,932 m: 0.03 s slower; 2,920 m: 0.26 s slower)
        (3170, 3237),   # hairpin, with its corner-table row at -9 (3,236 / 3,238 m the same; 3,232 / 3,234 / 3,240 m: 0.005-0.009 s gained only). Inert since v1.14: the planned line steers here
    )
    # v1.11: planned line (track memory): a whole-lap racing line computed offline from the track's geometry by
    # tools/raceline.py (the segments of corkscrew.xml rebuilt as TORCS builds them, then a curvature-smoothing
    # line inside |trackPos| 0.65, 0.5 at the apexes of the two fast right-handers at 1,042 m and 2,988 m:
    # `python tools/raceline.py --limit 0.65 --zone 990:1090:0.5 --zone 2940:3030:0.5 --table plan.txt`).
    # One row every plan_ds metres of distFromStart: the line's trackPos, its curvature (1/km, + = left) and the
    # speed the line allows there (km/h: sideways grip 15.5*(1 + 5e-4*v^2) m/s^2 fitted to our laps and the
    # braking distance to the corners ahead; no drive limit). Inside plan_zones the steering follows the line:
    # the live trackPos and the car's direction of travel (angle and speedY/speedX) are held to the line's
    # position and direction, with the line's curvature as feed-forward; the braking plan is still the
    # sensors' (beams, corner table, S-bend look), capped by the line's speed. Outside the zones (start, the
    # flick / Corkscrew and the finish straight) the sensor steering of v1.10 drives unchanged. v1.14: the second zone runs through the hairpin (to 3,330 m) and the table's rows from 3,000 to 3,600 m are from `python tools/raceline.py --limit 0.65 --zone 990:1090:0.5 --zone 2940:3030:0.5 --zone 3120:3245:0.78 --zone 3285:3450:0.78 --table plan.txt` (the line may use |trackPos| 0.78 on the way into and out of the hairpin, 0.65 at its apex; the rows before 3,000 m are v1.11's, unchanged: outside 3,000-3,580 m the two tables differ by 0.001 at most). v1.15: the flick / Corkscrew on the line: one zone (60 to 3,330 m) and the table's rows from 1,900 to 2,990 m (list entries 190-299) are from `python tools/raceline.py --limit 0.65 --zone 990:1090:0.5 --zone 2940:3030:0.5 --zone 3120:3245:0.78 --zone 3285:3450:0.78 --zone 2180:2335:0.3 --zone 2335:2420:0.5 --zone 2475:2510:0.5 --zone 2650:2770:0.5 --vcap 2335:2360:230 --table plan.txt` (|trackPos| at most 0.3 on the way to the crest, 0.5 through the right-hand kink at 2,350-2,378 m, 0.5 at the Corkscrew's right-hand apex where the wall stands at the track's edge, 0.5 at the 2,700 m apex; the line's speed is at most 230 km/h over the crest at 2,335-2,360 m, which the geometry does not show, with the line's braking leading up to it: a braking point from track memory, allowed by the user 2026-10-08; all other rows unchanged: outside 1,900-2,990 m that command's table differs from this one by 0.003 at most).
    plan_zones= ((60, 3330),)   # from m, to m: where the planned line steers (to 2,100 / 2,220 m the same; 2,250 m: damage over the crest at 2,351 m at 280 km/h; second zone ending 2,860 / 3,120 / 3,200 m: 0.09 s less / the same / the same; lap-wide: off at the flick, 1.5 s lost at the hairpin. v1.14: second zone 3,160 -> 3,330 m, the hairpin on the line: 0.28 s gained on 12 runs with the corner-table row at 0 where v1.11 lost 1.5 s (the feed-forward was 8 at low speed then and the row's -9 came off the line's cap); ending 3,330 / 3,360 / 3,400 / 3,460 m: the same lap time, 0.70 / 0.76 / 0.76 / 0.76 of the edge at the exit; with the finish straight and the start on the line as well ((-60, 2150), (2600, 3700)): the same. v1.15: one zone, (60, 2150), (2600, 3330) -> (60, 3330): the flick / Corkscrew on the line with its own limits and a crest cap in the table: 0.81 s gained on 12 runs; on v1.14's table the one zone ends in the wall at 2,492 m)
    plan_ramp=30        # m over which the planned steering fades in and out at a zone's ends (50: 0.03 s slower)
    plan_kp=.5          # steer per unit of trackPos away from the line (.3: 0.88 of the edge at the start kink; .8: 0.15 s slower)
    plan_kh=4.77        # steer per radian between the car's direction of travel and the line's direction (15/PI, the sensor steering's own; 4 the same, 6: 0.26 s slower)
    plan_slipmax=5      # deg: most slip angle (atan(speedY/speedX)) counted in the direction of travel; beyond it the nose counts, so a slide is still caught by counter-steer (3: 0.24 s slower; 7 the same; no limit: 3 of 12 perturbed runs off; nose only, 0: off at 566 m, the car runs 0.3 wide of the line in every bend)
    plan_ff=12          # feed-forward: steer per 1/m of the line's curvature at low speed (v1.13: 8.0 -> 12 with plan_ffv 9e-4 -> 6e-4: +30 % at 100 km/h, +13 % at 200, +8 % at 270; over 70 runs 0.351 s faster, apex at 1,931 m 0.79 -> 0.83-0.85 of the inside edge; 14 with 5e-4: 0.417 s, 0.86 at 490 m and 766 m; 8.8 / 9.6 / 10.4 with 9e-4: 0.29 / 0.36 / 0.52 s on 12 runs for 0.83 / 0.88 / 0.94 at 1,931 m; 11.2 with 9e-4: 3 of 12 off there) ...
    plan_ffv=6e-4       # ... rising by this share per (m/s)^2 (the fronts slip more at speed; v1.11, with plan_ff 8: 6e-4 / 7e-4: 0.3 s slower, the car runs wide of the line; 11e-4: 0.12 s faster on 12 runs, but it cuts inside the line at the fast apexes. v1.13: 6e-4 with plan_ff 12: the same lap time as plan_ff 9.6 / 10 with 9e-4 / 8e-4 for 0.03-0.05 less of the edge at the 1,931 m apex, entered at 278 km/h; 4e-4 / 3e-4 / 2e-4 with 16 / 18 / 20: the margin goes at 490 m instead, 0.85-0.89)
    plan_la=.15         # s: the feed-forward reads the curvature this far ahead (0: 0.12 s slower; .3 the same)
    plan_vs=1.02        # share of the line's speed the braking plan may reach (v1.17: 1.0 -> 1.02 with the line-error guard below; 12 perturbed runs with the guard: 1.0 67.644, 1.01 67.532, 1.02 67.469, 1.03 67.531, 1.04 67.517, 1.05 67.526 with 0.915 at the 2,700 m exit, 1.06: 3 of 12 off at 2,803 m; without the guard 1.03 / 1.04: 2 / 3 of 12 end at the Corkscrew wall). plan_v's entries 225-246 (2,250-2,460 m: crest cap, flick, Corkscrew's left apex) are divided by 1.02, so that stretch keeps v1.16's speeds (with 1.02 there: 0.02 s slower, crest 238 -> 243 km/h, wall side -0.55 -> -0.65); so are entries 62-86 (620-860 m, the 770 m bend: with 1.02 there 0.02 s faster, but with the stored speed read 10 m late every run leaves the track at the 770 m exit, 826 m; held: 0.880 at 839 m, 12.5 m late: 0.986)
    # v1.16: braking plan from track memory (user, 2026-10-08: "the braking plan is allowed to be predefined in the
    # track memory"). Inside plan_mem the allowed speed IS the table's speed (plan_v * plan_vs): the sensor plan
    # (beams, sharpness) and the corner table are not used there. The table gives a speed by distance, never a
    # pedal: brake, lift band, throttle, ABS and traction control still react to the car's live speed against it,
    # and the steering follows the line with live feedback as before. Before v1.16 the plan inside the line's zone
    # was min(sensor plan, plan_v) + a corner-table row everywhere; the sensor plan braked 15-25 km/h early for the
    # 770 m bend (676-730 m), and in the fast bends it fell step by step with the beams while the car coasted after
    # it. plan_v's entries 0-174 (0-1,740 m) are from
    # `python tools/raceline.py --limit 0.65 --zone 990:1090:0.5 --zone 2940:3030:0.5 --zone 3120:3245:0.78 --zone 3285:3450:0.78 --zone 2180:2335:0.3 --zone 2335:2420:0.5 --zone 2475:2510:0.5 --zone 2650:2770:0.5 --vcap 2335:2360:230 --vscale 960:1100:1.06 --vscale 1440:1600:1.07 --bscale 1440:1530:0.85 --table plan.txt`
    # (v1.15's command + the cornering speed of the line scaled per bend toward what the car carries: 1,042 m x1.06,
    # 1,528 m x1.07 with the braking into it x0.85; only the entries at 910-1,100 m and 1,440-1,600 m differ from
    # v1.15's); entries 175-360 and all of plan_pos / plan_curv are unchanged, byte for byte. 446 m, 770 m and
    # 2,700 m use the line's own speed (x1.0).
    # Left on min(sensor plan, plan_v) + corner row: the 1,931 m left-hander (on the stored speed the car cuts to
    # 0.87-0.94 of the inside edge at every factor tried, x0.94 to x1.04, also with the braking x0.7 / x0.85), the
    # flick / Corkscrew (stored: 0.01 s gained on 12 runs, but with plan_vs 1.03 5 of 10 runs end at the wall at
    # 2,492 m: the sensor plan is the ceiling there) and the 2,988 m right-hander (x1.12 / x1.15 / x1.18: -0.05 /
    # 0.01 / 0.05 s against the sensors, 0.74 / 0.76 / 0.88 of the edge; x1.25: off at 3,053 m) and the hairpin (stored,
    # with x1.025 for its +2 row: the same lap to 0.001 s, but with the speed read 7.5 m late the car leaves the
    # track at the exit, 3,314 m; with the sensor plan as the ceiling it stays at 0.90).
    # Factors (12 perturbed runs; s gained in the bend, exit's worst |trackPos|): 1,042 m x1.06 / x1.07 / x1.08 /
    # x1.10 / x1.12: 0.11 / 0.13 / 0.14 / 0.18 / 0.22 s, 0.80 / 0.80 / 0.79 / 0.79 / 0.84 (x1.16: 0.97 on one lap;
    # with plan_vs 1.04 on top x1.08: 3 of 12 off at 1,106 m, x1.07: 0.84, x1.06: 0.79); 1,528 m x1.07 / x1.10:
    # 0.04 / 0.06 s (x1.10 with plan_vs 1.03: 0.93 at 1,634 m and 1 of 12 off, 1.04: all off; x1.07: 0.70-0.79 up
    # to plan_vs 1.05; x1.10 without the gentler braking: no gain, 0.83); 2,700 m x1.0 / x1.02 / x1.04: 0.07 /
    # 0.09 / 0.12 s, 0.77 / 0.74 / 0.83 (x1.02 with plan_vs 1.03: 0.95 at 2,802 m, 1.04: off). A steeper braking pass (38 / 42 m/s^2 in place of 34): no gain.
    plan_mem= ((90, 1750), (2600, 2850))   # from m, to m: where the stored speed is the braking plan (start kink, 446 m, 770 m, 1,042 m, 1,528 m; 2,700 m)
    plan_vd=0           # m: the stored speed is read this far ahead of the car (0; the braking-plan check moves it by +-5 / +-10 m; 15 m late: off at 825 m, the 770 m exit)
    # Line-Error Guard (v1.17): a live ceiling on the planned speed. The stored speed assumes the car is on the
    # line; when it is not (v1.16 with plan_vs 1.03 / 1.04: the Corkscrew's left apex missed by 0.5-0.7 of the
    # half-width, full throttle toward the wall at 2,487 m, 2-3 of 12 runs ended there), the allowed speed is cut
    # by plan_ek per unit of trackPos the car is off plan_pos beyond plan_e0, at most plan_emax. On the standard
    # lap the car is within 0.36 of the line everywhere but the Corkscrew (0.41-0.47), so the guard acts only there.
    plan_ek=.5          # share of the allowed speed taken off per unit of trackPos off the line beyond plan_e0 (0 = off; 1: Corkscrew 0.14 s slower at plan_vs 1.04; 2 / 4: 0.5 / 1.0 s slower and the car brakes at full lock toward the wall, 0.93-0.95)
    plan_e0=.4          # trackPos off the line with no effect (0.3 with plan_ek 2: 1.4 s slower; 0.5 with plan_ek 1: no effect on the standard lap, measures like 0.4 / 0.5 at plan_vs 1.04)
    plan_emax=.5        # most taken off
    # v1.19: exit guard, and with it the throttle from the stored speed's slope.
    # Exit Guard. After each apex of plan_mem the stored speed rises far faster than the car can follow (2,700 m: 177
    # -> 308 km/h in 100 m, the car 179 -> 211 at full throttle), so nothing live limits the exit: the car is at
    # full throttle with the steering at its cap, and 2-3 km/h more at the apex puts it 0.2 of trackPos wider 60 m
    # later (v1.17 with the stored speed read 10 m early: 0.857 at 2,803 m against 0.651; v1.17's line-error guard
    # acts on the allowed speed, which the car cannot reach there). The guard acts on the throttle: for every unit
    # of trackPos the car is outside the planned line (on the side away from the steering) beyond plan_x0, read
    # plan_xt s ahead on its present rate, plan_xk of the throttle is taken off. On v1.17's 12 screen runs it
    # changes nothing at plan_x0 0.45 (all 12 laps identical); with the stored speed read 10 m early / late or 4 %
    # up it holds the exits (2,803 m: 0.857 -> 0.73 at plan_x0 0.3; a 2,700 m stretch 4 % faster: 5 of 12 off
    # without it, 0.644 with it at 0.3, but 0.16 s slower: the exit has no speed to give, the guard is margin).
    # Read on the present position only (plan_xt 0) it is late: 0.920 at 2,800 m and 0.940 at 831 m where 0.2 s
    # ahead gives 0.813 and 0.857. Only inside plan_mem (whole line zone: 0.06 s slower, 2,988 m and hairpin exits).
    plan_xk=5           # share of the throttle taken off per unit of trackPos outside the planned line beyond plan_x0 (0 = off)
    plan_x0=.45         # trackPos outside the line with no effect (0.3 / 0.4 with the throttle below: 0.13 / 0.07 s slower, the guard then acts on the standard lap at 1,631 m)
    plan_xt=.2          # s: the error is read this far ahead on its present rate (0: late, see above; 0.25: 0.02 s slower on 12 runs, 823 m 0.861 for 0.881)
    # Throttle From The Stored Speed's Slope (v1.18's mechanism, rejected there for the exits: with the stored speed
    # read 10 m early every run left the track at 2,803 m). Until v1.18 the car came into every bend of plan_mem at
    # the top of the lift band, coasted at throttle 0 until it was under the plan, and only then started the
    # throttle from its zero-torque floor at +0.05 per step: by then the stored speed was rising again and the car
    # ran 4-10 % under it at the slowest point. The stored speed's slope is known, so the throttle that makes the
    # car slow down as the plan does is known before the car is under it: (plan's acceleration v*dv/ds read
    # plan_tla s ahead + coasting deceleration 5.75 + 0.00161*v^2, v1.17's fit) * plan_tk, at most plan_tmax. Under
    # the plan it is a floor for the stored throttle; inside the lift band it is sent in place of 0, faded to none
    # at the top of the band. Live as before: the brake, the lift band, the full-lock limit, traction control and
    # the exit guard act on it. Only inside plan_tz: not at 1,042 m (its exit is 0.89-0.90 at 1,106 m with the
    # stored speed 10 m off or 4 % up, v1.17 0.80, and the guard does not hold it: the planned line itself ends at
    # 0.65 there) and not at 2,700 m (with the guard at 0.45 no gain there, 0.79 for 0.66 at 2,803 m).
    plan_tk=.05         # throttle per m/s^2 the stored speed asks for beyond coasting (0 = off; 0.04 with plan_tmax 0.5: 0.045 s for 0.075 on 12 runs)
    plan_tla=.1         # s ahead over which the stored speed's slope is read
    plan_tmax=.6        # most throttle from it (0.5: 0.030 s for 0.075 on 12 runs)
    plan_tz= ((90, 980), (1150, 1750))   # from m, to m: where it acts (start kink, 446 m, 770 m; 1,528 m)
    plan_ds= 10
    plan_pos= (0.003, 0.123, 0.145, 0.072, -0.064, -0.19, -0.303, -0.401, -0.484, -0.548, -0.589, -0.603, -0.588, -0.541, -0.458, -0.339, -0.179, 0.022, 0.268, 0.519, 0.64, 0.622, 0.459, 0.211, -0, -0.173, -0.312, -0.421, -0.503, -0.563, -0.604, -0.63, -0.643, -0.649, -0.65, -0.65, -0.65, -0.649, -0.622, -0.509, -0.241, 0.203, 0.499, 0.623, 0.65, 0.627, 0.559, 0.46, 0.572, 0.65, 0.605, 0.483, 0.302, 0.064, -0.246, -0.505, -0.622, -0.65, -0.644, -0.649, -0.616, -0.521, -0.388, -0.231, -0.061, 0.109, 0.27, 0.413, 0.529, 0.612, 0.65, 0.609, 0.455, 0.141, -0.25, -0.494, -0.615, -0.65, -0.618, -0.496, -0.249, 0.139, 0.422, 0.574, 0.638, 0.65, 0.65, 0.65, 0.65, 0.65, 0.65, 0.65, 0.65, 0.65, 0.65, 0.647, 0.625, 0.563, 0.439, 0.231, -0.053, -0.266, -0.401, -0.475, -0.499, -0.479, -0.388, -0.181, 0.164, 0.416, 0.563, 0.633, 0.65, 0.641, 0.612, 0.56, 0.482, 0.379, 0.247, 0.086, -0.101, -0.27, -0.405, -0.51, -0.584, -0.631, -0.65, -0.641, -0.603, -0.532, -0.459, -0.411, -0.384, -0.376, -0.384, -0.403, -0.433, -0.468, -0.507, -0.546, -0.582, -0.613, -0.635, -0.648, -0.648, -0.617, -0.522, -0.333, -0.031, 0.234, 0.426, 0.555, 0.63, 0.65, 0.619, 0.558, 0.476, 0.377, 0.262, 0.125, -0.04, -0.241, -0.446, -0.569, -0.629, -0.648, -0.65, -0.65, -0.649, -0.648, -0.646, -0.645, -0.643, -0.642, -0.642, -0.641, -0.641, -0.642, -0.643, -0.644, -0.645, -0.646, -0.647, -0.649, -0.649, -0.65, -0.65, -0.645, -0.612, -0.519, -0.333, -0.026, 0.413, 0.637, 0.577, 0.214, -0.202, -0.465, -0.606, -0.65, -0.623, -0.534, -0.382, -0.269, -0.27, -0.36, -0.411, -0.412, -0.376, -0.336, -0.3, -0.269, -0.248, -0.24, -0.251, -0.279, -0.3, -0.305, -0.301, -0.292, -0.272, -0.217, -0.123, 0.007, 0.127, 0.214, 0.271, 0.298, 0.295, 0.281, 0.258, 0.217, 0.149, 0.045, -0.106, -0.315, -0.461, -0.5, -0.484, -0.48, -0.496, -0.495, -0.407, -0.111, 0.31, 0.564, 0.65, 0.41, -0.166, -0.5, -0.408, -0.13, 0.267, 0.564, 0.649, 0.593, 0.429, 0.269, 0.199, 0.251, 0.438, 0.591, 0.65, 0.584, 0.402, 0.332, 0.399, 0.469, 0.495, 0.5, 0.499, 0.499, 0.5, 0.498, 0.483, 0.439, 0.353, 0.207, -0.013, -0.279, -0.445, -0.514, -0.503, -0.425, -0.298, -0.138, 0.041, 0.221, 0.387, 0.523, 0.615, 0.65, 0.611, 0.475, 0.217, -0.111, -0.328, -0.449, -0.497, -0.489, -0.418, -0.248, 0.053, 0.366, 0.547, 0.631, 0.65, 0.629, 0.578, 0.501, 0.404, 0.29, 0.166, 0.035, -0.098, -0.229, -0.355, -0.472, -0.575, -0.663, -0.73, -0.771, -0.778, -0.711, -0.46, 0.111, 0.554, 0.647, 0.422, -0.194, -0.62, -0.762, -0.78, -0.779, -0.776, -0.77, -0.763, -0.754, -0.743, -0.731, -0.718, -0.705, -0.69, -0.675, -0.661, -0.65, -0.642, -0.636, -0.628, -0.612, -0.584, -0.544, -0.496, -0.448, -0.412, -0.401, -0.408, -0.407, -0.366, -0.272, -0.134)
    plan_curv= (0.77, 0.6, 0.71, 0.81, 0.8, 0.77, 0.81, 0.95, 1.15, 1.38, 1.59, 1.77, 1.94, 2.09, 2.22, 2.35, 2.48, 2.62, 2.77, 2.9, 2.97, 2.89, 2.7, 2.48, 2.24, 2.01, 1.79, 1.57, 1.35, 1.14, 0.92, 0.71, 0.49, 0.27, 0.05, 0, 0, 1.48, 5.2, 8.92, 12.76, 16.78, 20.88, 24.84, 27.86, 27.05, 26.52, 26.93, 28.17, 29.04, 25.91, 22.34, 18.73, 15.21, 11.79, 8.52, 5.28, 1.99, -0.9, -3.56, -3.84, -3.72, -3.7, -3.75, -3.84, -3.98, -4.18, -4.39, -4.58, -4.69, -4.89, -6.85, -9.09, -11.38, -13.75, -16.05, -18.12, -19.67, -17.71, -15.11, -12.57, -10.08, -7.7, -5.36, -3, -0.63, 0, 0, 0, 0, 0, 0, 0, 0, -0.09, -1.15, -2.41, -3.69, -5.01, -6.37, -7.81, -9.34, -10.89, -12.34, -13.45, -12.43, -10.92, -9.36, -7.77, -6.21, -4.65, -3.07, -1.48, -1.25, -1.39, -1.5, -1.58, -1.65, -1.72, -1.79, -1.86, -1.93, -2, -2.08, -2.16, -2.22, -2.23, -2.1, -1.9, -1.7, -1.5, -1.31, -1.12, -0.93, -0.75, -0.56, -0.37, -0.19, -0.01, 0.16, 0.32, 0.47, 0.61, 0.73, 1.83, 3.77, 5.7, 7.59, 9.42, 11.27, 13.27, 15.41, 17.46, 18.6, 17.13, 15.43, 13.74, 12.14, 10.64, 9.21, 7.83, 6.47, 5.13, 3.79, 2.44, 1.05, 0.06, 0.03, 0.02, 0.01, 0, -0.01, -0.01, -0.02, -0.02, -0.03, -0.02, -0.02, -0.02, -0.01, -0, 0, 0.01, 0.02, 0.02, 0.02, 0.14, 1.76, 3.56, 5.35, 7.16, 9.03, 10.83, 12.36, 11.67, 10.21, 8.7, 7.21, 5.71, 4.15, 3.81, 3.77, 3.67, 3.53, 3.37, 3.2, 3.03, 2.84, 2.65, 2.44, 2.24, 2.01, 1.77, 1.54, 1.34, 1.13, 0.88, 0.57, 0.26, 0.23, 0.25, 0.24, 0.24, 0.23, 0.23, 0.24, 0.25, 0.26, -0.03, -0.54, -1.06, -1.61, -2.19, -2.8, -3.48, -4.18, -4.82, -5.15, -3.28, -1.16, 0.94, 5.05, 12.32, 20.02, 28.35, 37.11, 43.87, 22.27, -5.18, -29.14, -27.92, -22.33, -17.17, -12.56, -8.24, -6.54, -5.03, -3.3, -1.5, 0.29, 2.03, 3.65, 5.12, 6.35, 7.57, 8.86, 10.22, 11.59, 12.84, 13.84, 14.12, 14.05, 13.72, 12.95, 11.89, 10.8, 9.73, 8.7, 7.71, 6.75, 5.81, 4.87, 3.92, 2.97, 2.01, 1.05, 0.1, -0.84, -1.76, -2.65, -3.48, -4.28, -5.77, -7.31, -8.93, -10.66, -12.42, -14.07, -15.46, -15, -13.17, -11.31, -9.45, -7.62, -5.82, -3.97, -2.18, -1.83, -1.55, -1.24, -0.94, -0.65, -0.38, -0.14, 0.1, 0.34, 0.56, 0.75, 0.96, 1.23, 1.57, 1.92, 4.25, 10.91, 18.3, 26.84, 36.47, 40.93, 32.52, 24.05, 15.81, 7.57, 0.66, 0.13, 0.12, 0.12, 0.11, 0.09, 0.07, 0.06, 0.05, 0.05, 0.02, -0.06, -0.16, -0.21, -0.13, 0.11, 0.48, 0.75, 0.74, 0.5, 0.02, -0.78, -1.5, -1.17, 0.49, 2.44, 3.25, 2.66, 1.5)
    plan_v= (360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 353, 341, 328, 314, 300, 285, 269, 253, 234, 215, 194, 173, 154, 138, 123, 112, 103, 99, 102, 104, 102, 98, 97, 105, 117, 135, 164, 210, 247, 314, 360, 352, 343, 337, 329, 313.7, 303.9, 294.1, 282.4, 270.6, 257.8, 243.1, 227.5, 209.8, 192.2, 175.5, 159.8, 147.1, 137.3, 129.4, 125.5, 139.2, 161.8, 197.1, 222.5, 254.9, 304.9, 352.9, 352.9, 352.9, 360, 360, 360, 360, 357, 345, 332, 318, 304, 290, 276, 262, 249, 236, 225, 214, 204, 196, 216, 231, 249, 274, 307, 340, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 353, 340, 327, 313, 299, 283, 268, 252, 237, 222, 207, 192, 179, 167, 157, 149, 145, 157, 173, 196, 221, 236, 254, 262, 283, 318, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 357, 344, 331, 317, 303, 288, 273, 257, 243, 230, 218, 207, 201, 211, 225, 244, 268, 301, 352, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 351, 338.2, 325.5, 312.7, 299, 284.3, 269.6, 253.9, 237.3, 225.5, 225.5, 229.4, 217.6, 199, 178.4, 157.8, 136.3, 117.6, 101, 87.3, 76.5, 70.6, 111, 105, 91, 100, 117, 146, 201, 254, 281, 320, 322, 310, 295, 280, 266, 252, 240, 228, 215, 203, 192, 184, 179, 177, 178, 183, 197, 209, 219, 231, 244, 259, 277, 299, 326, 360, 355, 345, 332, 319, 305, 290, 276, 261, 245, 230, 215, 199, 184, 172, 163, 158, 167, 193, 214, 234, 261, 299, 355, 360, 360, 360, 360, 349, 337, 323, 309, 295, 279, 263, 246, 227, 207, 186, 164, 143, 124, 106, 90, 79, 78, 90, 111, 158, 264, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360, 360)
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
    # Turn Table (v1.08, track memory): no bend before the row's end (see the knob block).
    for t0, t1 in turn_table:
        if t0 <= S['distFromStart'] < t1: side= 0
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
    # Line Table (v1.07, track memory): out of the bend before it the car comes to
    # the hairpin on the inside half (+0.23 at 3,100 m), and the sensor set-up
    # above starts only once the road's end shows which way it turns (~3,115 m;
    # 1,931 m: ~1,780 m) and ends at setup_road, so the car turned in from the
    # centre (-0.02) at the hairpin and from -0.30 at 1,931 m. The table says
    # where the approach to such a corner starts and on which side to be; the
    # pull is the set-up's own (line_gain, capped), and it ends when the sensors
    # detect the bend (side set from the bearing) or the row ends.
    for l0, l1, lt, lc in line_table:
        if l0 <= S['distFromStart'] < l1 and side == 0:
            setup= 0   # the row replaces the sensor set-up's pull
            line_target= lt
            R['steer']+= clip((lt - S['trackPos'])*line_gain, -lc, lc)
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
    # Planned Line (v1.11, track memory): inside plan_zones the steering above is replaced by a follower of the
    # precomputed line (see the knob block). The table says where the line is and how it bends; the loop is
    # closed on the live readings: trackPos against the line's position, the direction of travel (the nose
    # angle less the slip angle, limited to plan_slipmax) against the line's direction, plus the steering the
    # line's curvature needs at this speed. Measuring the direction at the nose alone left the car 0.3 wide
    # of the line in every bend (the nose points inside the direction of travel by the slip angle); with no
    # limit on the slip angle a slide was no longer counter-steered (38 of 70 perturbed runs off).
    from math import atan, atan2
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
        p_steer= ((S['angle'] - clip(p_slip, -plan_slipmax*PI/180, plan_slipmax*PI/180) - p_dir)*plan_kh
                  + (p0 - S['trackPos'])*plan_kp
                  + plan_at(plan_curv, pd + plan_la*pv)/1000*plan_ff*(1 + plan_ffv*pv*pv))
        R['steer']= pw*p_steer + (1-pw)*R['steer']
        line_target= p0
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
        if S['speedX'] > brake_hi_car: return brake_dist_speed(d, brake_max_hi)   # v1.05: no gate at speed (braking for 1,528 m, 1,927 m and the flick approach)
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
    # S-Bend Look (v1.04): the 19 track beams cannot tell a flat-out kink with
    # a straight behind it from a kink with a slow corner behind it: both show
    # beams growing with the angle up to the kink's inside edge (start kink at
    # 159 m: -4 deg 68 m, -7 deg 80 m, -12 deg 37 m; flick approach at 2,346 m:
    # +4 deg 61 m, +7 deg 84 m, +12 deg 103 m, +19 deg 16 m). The five focus
    # beams, 1 deg apart, do: at the start kink the rays keep growing toward
    # the inside edge (-8 to -11 deg: 84, 90, 96, 103 m), on the flick approach
    # they jump at the next corner's inside edge and then fall (+7 deg 84 m,
    # +8 to +12 deg: 112, 110, 108, 106, 103 m): the far edge faces the car, so
    # the road turns back behind the kink. The server answers a focus request
    # once per second (-1 otherwise) and only when asked (an angle outside
    # +-90 deg asks for nothing and uses up no reading), so the look is asked
    # for at the end of this function when the longest beam sits at the edge
    # of a kink. Until v1.03 the speed at 2,365 m was set by a chance plan dip
    # at 2,345-2,349 m (228-246 km/h over the 70 standard runs; the runs that
    # skipped the dip slid to 0.81-0.86 and lost 0.2 s). With the slow corner
    # known at 2,336 m the plan is capped at the braking distance to it for
    # sb_hold steps: 230-239 km/h at 2,365 m on every run.
    fo= S.get('focus', [-1]*5)
    fc= getattr(c, 'foc_next', 100)   # the angle asked for last step (100 = none)
    if fc != 100 and type(fo) is list and min(fo) >= 0:
        r= fo[::-1] if fc < 0 else fo      # by |angle| rising; r[4] is at the track beam's angle
        if min(r) > .5*max(r) and r[0] > r[4] + sb_fall:
            c.sb_d, c.sb_s, c.sb_n= max(r), 0, 0
    if getattr(c, 'sb_n', 999) < sb_hold:
        allowed_speed= min(allowed_speed, brake_speed(c.sb_d - c.sb_s - sb_x)*3.6)
        c.sb_s+= S['speedX']/3.6*.021; c.sb_n+= 1
    # Corner Table (v1.06, track memory): in the medium bends the car rides this
    # plan at |steer| 0.25-0.47 with 0.27-0.49 of the track's half-width used
    # (70 perturbed runs), and what headroom a bend has cannot be sensed (v1.01:
    # the bends that gain and the ones that lose overlap in steer and slip). The
    # table says which bend this is; the offset is added to whatever the sensors
    # plan, through the braking zone and the bend, so the brake point, the lift
    # band, ABS and the steering still react to the live readings.
    # Planned Line's Speed (v1.11): on the planned line the beams look across the bend and the sensor plan
    # reads more speed than the line can carry (450 m: 122 km/h allowed at 420 m, the line's limit is 107);
    # inside plan_zones the plan is capped by the line's own speed. The corner table's offsets still apply.
    if pw > 0:
        allowed_speed= min(allowed_speed, plan_at(plan_v, pd)*plan_vs + 300*(1-pw))
    # Braking Plan From Track Memory (v1.16): inside plan_mem the stored speed is the plan itself (see the knob
    # block); the pedals below still close the loop on the live speed. Corner-table rows inside plan_mem are inert.
    if any(z0 <= pd < z1 for z0, z1 in plan_mem):
        allowed_speed= plan_at(plan_v, pd + plan_vd)*plan_vs
    else:
        for z0, z1, zo in corner_table:
            if z0 <= S['distFromStart'] < z1: allowed_speed+= zo
    # Line-Error Guard (v1.17): less speed allowed while the car is off the planned line (see the knob block).
    if pw > 0 and plan_ek > 0:
        allowed_speed*= 1 - pw*clip((abs(S['trackPos'] - plan_at(plan_pos, pd)) - plan_e0)*plan_ek, 0, plan_emax)
    c.allowed_speed= allowed_speed   # kept for telemetry and for the next step's exit run-out (v0.81)
    # Throttle From The Stored Speed's Slope (v1.19, see the knob block): 0 outside plan_tz and while the plan
    # falls faster than the car coasts.
    thr_ff= 0
    if plan_tk > 0 and any(z0 <= pd < z1 for z0, z1 in plan_tz):
        vms= max(S['speedX'], 0)/3.6
        tds= max(vms*plan_tla, 1)
        a_p= vms*(plan_at(plan_v, pd+plan_vd+tds) - plan_at(plan_v, pd+plan_vd))*plan_vs/3.6/tds   # m/s^2 the stored speed asks for
        thr_ff= clip((a_p + 5.75 + .00161*vms*vms)*plan_tk, 0, plan_tmax)

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
        R['accel']= max(R['accel'], thr_zero*eng_brk/(1+eng_brk), thr_ff)
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
    # Exit Guard (v1.19, see the knob block): throttle taken off while the car is, or is about to be, outside the
    # planned line by more than plan_x0. The stored throttle is limited too, like the full-lock limit above.
    xe= S['trackPos'] - plan_at(plan_pos, pd)   # off the planned line, + = left of it
    c.xe_rate= .7*getattr(c, 'xe_rate', 0) + .3*(xe - getattr(c, 'xe_prev', xe))/.021   # per second, smoothed
    c.xe_prev= xe
    xg= 1
    if plan_xk > 0 and any(z0 <= pd < z1 for z0, z1 in plan_mem):
        xg= 1 - pw*clip((-out_side*(xe + c.xe_rate*plan_xt) - plan_x0)*plan_xk, 0, 1)
    R['accel']= min(R['accel'], xg)

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
    # the standing start. So below exit_v the launch allowance applies again,
    # faded out with |steer| (none from exit_steer) and sideways speed (none
    # from exit_vy): only while the car is straight and not sliding.
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
          and S['rpm']*gear_ratios[gear-2]/gear_ratios[gear-1] < (brake_ds_rpm if R['brake'] > 0 and S['speedX']-allowed_speed > brake_ds_over
             else max(drive_ds_rpm, downshift_rpm) if R['brake'] == 0 and c.throttle > 0 and getattr(c, 'sh_t', 99) >= drive_ds_wait   # Gear For The Exit (v1.22)
             else max(entry_ds_rpm, downshift_rpm) if any(z0 <= pd < z1 for z0, z1 in entry_ds_zones)   # Gear Into The Bend (v1.23)
             else downshift_rpm)):
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
    c.sh_t= 0 if gear != int(S['gear']) else getattr(c, 'sh_t', 99) + 1   # steps since the last shift (v1.22)
    R['gear']= gear
    # Focus request (v1.04, see S-Bend Look): one integer angle, the centre of
    # the five beams, taken by the server for its next reading.
    c.foc_sent= getattr(c, 'foc_next', 100)   # for telemetry: the angle this step's reading was asked at
    c.foc_next= 100
    il= max(range(19), key=lambda i: S['track'][i])
    if (1 <= il <= 17 and abs(TRACK_ANGLES[il]) >= sb_a and S['speedX'] > sb_v and c.steer_f < sb_steer
            and S['track'][il + (1 if il > 9 else -1)] < .5*S['track'][il]):
        c.foc_next= int(TRACK_ANGLES[il]) - (2 if il > 9 else -2)
    R['focus']= [c.foc_next]
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
    run_dir= os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'runs')
    os.makedirs(run_dir, exist_ok=True)
    log_path= os.path.join(run_dir, time.strftime('run_%Y%m%d_%H%M%S.csv'))
    log= open(log_path, 'w', buffering=1)  # line-buffered: rows survive Ctrl-C.
    log.write('step,curLapTime,lastLapTime,distFromStart,speedX,speedY,gear,rpm,'
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
        log.write('%d,%.3f,%.3f,%.1f,%.1f,%.1f,%d,%.0f,%.3f,%.3f,%.3f,%.3f,%.3f,%.1f,%.1f,%.0f,%.2f,%.3f,%.1f,%.1f,%.3f,%s,%d,%s\n' % (
            C.maxSteps-step, S['curLapTime'], S['lastLapTime'], S['distFromStart'],
            S['speedX'], S['speedY'], S['gear'], S['rpm'], R['accel'], R['brake'],
            R['steer'], S['trackPos'], S['angle'], max(S['track'][8:11]),
            (w[2]+w[3])-(w[0]+w[1]), S['damage'], C.aim, C.line_target, C.ahead, C.allowed_speed, C.throttle,
            ','.join('%.1f' % d for d in S['track']), C.foc_sent, ','.join('%.1f' % d for d in S['focus'])))
    log.close()
    C.shutdown()
