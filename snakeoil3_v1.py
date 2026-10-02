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
    corner_speed=76   # km/h the car must be able to slow to by the end of the visible road (v0.62: 75 -> 76; 77 leaves the track at the flick in 1 of 30).
    brake_decel=14.0  # m/s^2 of deceleration assumed when planning (measured ~13.9 at pedal 0.2-0.3, 18-30 above 0.3 at speed).
    brake_aero=.006   # extra planned deceleration per (m/s)^2 of speed: brake_decel*load + brake_aero*v^2 (drag and downforce).
    brake_max=28      # m/s^2: most deceleration ever planned (measured ~27-30 at 200-240 km/h; brake_aero*v^2 alone would claim 40+).
    brake_load_min=.5 # brake_decel is scaled by the tyre load from the vertical acceleration (crests), never below this share.
    brake_margin=15   # m of visible road kept in reserve.
    brake_gain=.05    # brake pedal per km/h over the allowed speed (20 km/h over = full brake).
    lookahead_gain=2.0  # steer per radian of bearing toward the open road ahead.
    line_offset=.47     # racing line: trackPos aimed for, outside before/after a bend, inside near the apex (0 = centre).
    line_gain=.50       # steer per unit of trackPos away from the racing line (only in bends).
    line_aim_off=1      # deg: a bend starts when the bearing passes 2 deg and lasts until it falls below this.
    line_apex=.34       # extra trackPos aimed for on the inside near the apex (on top of line_offset) ...
    apex_steer=.3       # ... in full while |steer| is below this ...
    apex_steer_fade=.25 # ... and fading out over this much more |steer| (none from 0.55: hairpin, flick).
    line_ki=1.5         # inside line integral: steer added per second per unit of trackPos short of the inside target ...
    line_imax=.4        # ... at most this much steer ...
    line_isteer=.4      # ... in full while |steer| is below this ...
    line_ifade=.25      # ... fading out over this much more |steer| (none from 0.65: hairpin, flick) ...
    setup_dist=160      # m: corner set-up (v0.58): with less road than this visible along the track direction ...
    setup_beam=2        # deg: ... the beams this far either side of it ...
    setup_min=3         # m: ... differing by more than this tell the coming bend's side early.
    setup_offset=.85    # trackPos aimed for on the outside during the set-up ...
    setup_road=95       # m: ... while more road than this is visible along the track direction.
    setup_steer=.045    # no set-up while |steer| is above this (the car is still in a bend: kink, flick approach).
    line_idecay=.85     # ... and outside the inside half of a bend it fades by this share per step.
    rel_start=7         # m: exit release (v0.61): once the road along the track has grown this much past the bend's shortest ...
    rel_width=2         # m: ... the inside target is released over this much more road ...
    rel_share=.8        # ... by this share (the car runs out toward the exit; the inside integral is kept).
    max_steer_step=.2   # most the steering may change in one step (~21 ms).
    upshift_rpm=18600   # shift up above this, just under the limiter (18,700): power still rises to 18,000 and the gears are close.
    downshift_rpm=15000 # shift down only if the lower gear would land below this (v0.54: keeps the engine near its 16-18k torque peak).
    lowest_running_gear=2  # never shift down below this while moving (1st is only for the start).
    ahead_angle_max=3   # deg: also measure the road ahead along the track direction when the car points within this of it.
    turn_grip=7.0       # m/s^2 of sideways acceleration assumed when curving onto a beam (0 = plan from the road ahead only).
    turn_steer_max=.78  # curving onto beams is not planned above this |steer| (near full lock).
    turn_steer_fade=.17 # its credit fades out linearly over this much |steer| below turn_steer_max (full credit up to 0.61).
    fade_lp=.9          # that |steer| is smoothed: share of the previous smoothed value kept per step (v0.57; 0 = raw steer).
    turn_grip_aero=1.5e-4  # turn_grip rises by this share per (m/s)^2 of speed (downforce): +12% at 100 km/h, +46% at 200.
    grip_boost=.3       # v0.60: turn_grip is raised by this share while the smoothed |steer| is below boost_steer ...
    boost_steer=.2      # ... (light steering = grip to spare: steady medium bends ride the plan at |steer| 0.15-0.3) ...
    boost_fade=.1       # ... fading out over this much more |steer| (none from 0.3).
    tc_slip=2.5         # m/s the rear wheels may outrun the fronts before traction control cuts (acceleration peaks at 2-2.5).
    tc_gain=.5          # throttle cut per m/s of rear over-speed beyond tc_slip.
    tc_hold=.8          # share of last step's traction-control cut still applied this step (fades the cut out).
    tc_slip_straight=5.0  # m/s of extra over-speed allowed when the car goes straight (the rears carry no sideways load).
    tc_slip_steer=.7    # |steer| at which that extra is gone (it falls linearly from steer 0 to here).
    tc_slip_slide=20    # km/h of sideways speed at which that extra is gone too (no extra while the car slides).
    lock_steer=.6       # above this |steer| the throttle is limited, falling to lock_throttle at full lock.
    lock_throttle=.2    # most throttle allowed at full lock (the car cannot turn tighter, more speed runs it wide).
    lock_throttle_edge=.1  # most throttle at full lock once the outside edge is lock_room_near or closer.
    lock_room_near=.3   # trackPos units to the outside edge where the full-lock limit reaches lock_throttle_edge.
    lock_room_far=.8    # ... and from which it is lock_throttle (linear between).
    lift_pct=1.0        # % of speed over the allowed speed where the car only lifts (throttle 0, stored throttle kept), before braking.
    lift_v0=86          # km/h: no lift band below this speed (slow corners brake at once) ...
    lift_vw=57          # km/h: ... full band from lift_v0 + lift_vw (linear between).
    abs_ratio=.85       # ABS: the brake is cut once the slowest wheel turns below this share of the car speed (v0.55: was 0.8) ...
    abs_cut=.5          # ... to this share of the pedal.
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
    setup= 0
    if side == 0 and 0 < road < setup_dist and abs(prev_steer) < setup_steer:
        asym= beam_at(S['track'], track_dir+setup_beam) - beam_at(S['track'], track_dir-setup_beam)
        if abs(asym) > setup_min:
            setup= 1 if asym > 0 else -1   # longer road to the right: right-hand bend
    if setup != 0 and road > setup_road:
        line_target= setup_offset*setup
        R['steer']+= (line_target - S['trackPos'])*line_gain
    if side != 0:
        phase= clip((road-60)/20, -1, 1)   # +1 approaching or exiting, -1 near the apex
        # Apex: in medium bends (moderate steering) the car can hold a tighter
        # inside line, which opens the radius of the whole bend (v0.52 trials:
        # inside offset 0.7-0.8 alone was 0.3-0.5 s faster over 30 perturbed
        # laps, a wider outside 0.6 was not). Near full lock (hairpin, flick)
        # it cannot: a target further inside only asks for more lock, so the
        # extra fades out with |steer| between apex_steer and +apex_steer_fade.
        offset= line_offset
        if phase < 0:
            offset+= line_apex*clip((apex_steer+apex_steer_fade-abs(prev_steer))/apex_steer_fade, 0, 1)
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
    # change of speedZ (km/h per ~21 ms step, smoothed), between brake_load_min and 1.
    from math import exp, log
    v_corner= corner_speed/3.6
    vz= S['speedZ']; az= (vz - getattr(c, 'vz_prev', vz))/3.6/.021; c.vz_prev= vz
    c.az= .7*getattr(c, 'az', 0) + .3*az   # m/s^2, smoothed
    a_mech= brake_decel*clip(1 + c.az/9.81, brake_load_min, 1)
    def brake_speed(d):   # m/s from which the car can slow to v_corner in d metres
        d= max(0, d-brake_margin)
        a0= a_mech + brake_aero*v_corner**2   # planned deceleration at v_corner
        if a0 >= brake_max: return (v_corner**2 + 2*brake_max*d)**.5
        d_cap= log(brake_max/a0)/(2*brake_aero)
        if d <= d_cap: return ((a0*exp(2*brake_aero*d) - a_mech)/brake_aero)**.5
        return ((brake_max - a_mech)/brake_aero + 2*brake_max*(d - d_cap))**.5
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
    if c.steer_f <= turn_steer_max:
        for d, a in zip(S['track'], TRACK_ANGLES):
            if d <= 0 or a == 0: continue
            radius= d / (2*sin(abs(a)*PI/180))
            if any(d2 < 2*radius*sin(abs(a2)*PI/180) for d2, a2 in zip(S['track'], TRACK_ANGLES)
                   if a2*a > 0 and abs(a2) < abs(a)): continue   # curve would leave the track
            v_brake= brake_speed(d)
            v_grip= (tg*radius/max(1 - tg*turn_grip_aero*radius, .1))**.5
            sharp= max(sharp, min(v_brake, v_grip)*3.6)
        allowed_speed= road_plan + (sharp-road_plan)*clip((turn_steer_max-c.steer_f)/turn_steer_fade, 0, 1)
    c.allowed_speed= allowed_speed   # kept for telemetry only

    # Throttle Control
    if S['speedX'] < min(target_speed - (abs(R['steer'])*50), allowed_speed):
        R['accel']+= .05
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
    lift_band= lift_pct/100*S['speedX']*clip((S['speedX']-lift_v0)/lift_vw, 0, 1)
    lift= False
    R['brake']= 0
    if ahead >= 0 and S['speedX'] > allowed_speed + lift_band:
        R['brake']= min(1, (S['speedX']-allowed_speed-lift_band)*brake_gain)
        R['accel']= 0
    elif ahead >= 0 and S['speedX'] > allowed_speed:
        lift= True
        R['accel']= max(R['accel']+.01, 0)   # stored throttle kept; the throttle sent is 0 (end of drive_example)

    # ABS: cut the brake to abs_cut once any wheel turns below abs_ratio of the
    # car speed (locking). v0.55: from 0.8 to 0.85 the cut starts earlier; the
    # big braking zones were lock-limited (pedal ~0.4-0.5 after the cut) and
    # releasing sooner keeps the tyres nearer their peak (3x10 suites -0.23 s).
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
    # lock), so the limit also falls as the outside edge comes closer: from
    # lock_throttle with lock_room_far or more of room to lock_throttle_edge at
    # lock_room_near. Outside = right in a left turn (steer +), left in a right turn.
    room= 1 + (1 if R['steer'] > 0 else -1)*S['trackPos']   # trackPos units to the outside edge
    lt= lock_throttle_edge + (lock_throttle-lock_throttle_edge)*clip((room-lock_room_near)/(lock_room_far-lock_room_near), 0, 1)
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
    c.throttle= clip(R['accel'], 0, 1)
    c.tc_cut= max(clip((rear_over-slip_target)*tc_gain, 0, 1), getattr(c, 'tc_cut', 0)*tc_hold)
    R['accel']= c.throttle - c.tc_cut
    if lift: R['accel']= 0   # lift band: nothing sent, c.throttle stays for the next step

    # Automatic Transmission: shift on engine RPM. Shift up above upshift_rpm;
    # shift down only when the lower gear would land below downshift_rpm, and
    # never below lowest_running_gear: 1st gear's engine braking makes the rear
    # step out in slow corners, so 1st is used only to start (below 10 km/h).
    gear_ratios= [3.9, 2.9, 2.3, 1.87, 1.68, 1.54]   # gears 1-6, from car1-ow1.xml
    gear= int(S['gear'])
    if gear < 1 or S['speedX'] < 10:
        gear= 1
    elif gear < 6 and S['rpm'] > upshift_rpm:
        gear+= 1
    elif gear > lowest_running_gear and S['rpm']*gear_ratios[gear-2]/gear_ratios[gear-1] < downshift_rpm:
        gear-= 1
    R['gear']= gear
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
