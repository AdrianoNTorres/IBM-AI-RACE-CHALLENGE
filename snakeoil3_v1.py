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
    target_speed=250  # km/h throttle aim on straights (the braking plan, not this, now sets the speed into corners).
    corner_speed=75   # km/h the car must be able to slow to by the end of the visible road.
    brake_decel=14.0  # m/s^2 of deceleration assumed when planning (measured ~13.9 at pedal 0.2-0.3, 18-30 above 0.3 at speed).
    brake_aero=.004   # extra planned deceleration per (m/s)^2 of speed: brake_decel + brake_aero*v^2 (drag and downforce).
    brake_margin=15   # m of visible road kept in reserve.
    brake_gain=.05    # brake pedal per km/h over the allowed speed (20 km/h over = full brake).
    lookahead_gain=2.0  # steer per radian of bearing toward the open road ahead.
    line_offset=0.5     # racing line: trackPos aimed for, outside before/after a bend, inside near the apex (0 = centre).
    line_gain=.50       # steer per unit of trackPos away from the racing line (only in bends).
    line_aim_off=1      # deg: a bend starts when the bearing passes 2 deg and lasts until it falls below this.
    max_steer_step=.2   # most the steering may change in one step (~21 ms).
    upshift_rpm=18500   # shift up above this, just under the limiter (18,700): power still rises to 18,000 and the gears are close.
    downshift_rpm=13500 # shift down only if the lower gear would land below this.
    lowest_running_gear=2  # never shift down below this while moving (1st is only for the start).
    ahead_angle_max=3   # deg: also measure the road ahead along the track direction when the car points within this of it.
    turn_grip=7.0       # m/s^2 of sideways acceleration assumed when curving onto a beam (0 = plan from the road ahead only).
    turn_steer_max=.6   # curving onto beams is only planned while |steer| is at most this (not near full lock).
    tc_slip=2.5         # m/s the rear wheels may outrun the fronts before traction control cuts (acceleration peaks at 2-2.5).
    tc_gain=.5          # throttle cut per m/s of rear over-speed beyond tc_slip.
    tc_hold=.8          # share of last step's traction-control cut still applied this step (fades the cut out).
    lock_steer=.6       # above this |steer| the throttle is limited, falling to lock_throttle at full lock.
    lock_throttle=.2    # most throttle allowed at full lock (the car cannot turn tighter, more speed runs it wide).
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
    if side != 0:
        road= max(beam_at(S['track'], track_dir+d) for d in (-.5, 0, .5))   # along the track direction
        phase= clip((road-60)/20, -1, 1)   # +1 approaching or exiting, -1 near the apex
        line_target= line_offset*phase*side
        R['steer']+= (line_target - S['trackPos'])*line_gain
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
    from math import exp
    v_corner= corner_speed/3.6
    def brake_speed(d):   # m/s from which the car can slow to v_corner in d metres
        d= max(0, d-brake_margin)
        if brake_aero <= 0:
            return (v_corner**2 + 2*brake_decel*d)**.5
        return (((brake_decel + brake_aero*v_corner**2)*exp(min(2*brake_aero*d, 50)) - brake_decel)/brake_aero)**.5
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
    from math import sin
    if abs(R['steer']) <= turn_steer_max:
        for d, a in zip(S['track'], TRACK_ANGLES):
            if d <= 0 or a == 0: continue
            radius= d / (2*sin(abs(a)*PI/180))
            if any(d2 < 2*radius*sin(abs(a2)*PI/180) for d2, a2 in zip(S['track'], TRACK_ANGLES)
                   if a2*a > 0 and abs(a2) < abs(a)): continue   # curve would leave the track
            v_brake= brake_speed(d)
            v_grip= (turn_grip*radius)**.5
            allowed_speed= max(allowed_speed, min(v_brake, v_grip)*3.6)
    c.allowed_speed= allowed_speed   # kept for telemetry only

    # Throttle Control
    if S['speedX'] < min(target_speed - (abs(R['steer'])*50), allowed_speed):
        R['accel']+= .05
    else:
        R['accel']-= .01
    if S['speedX']<10:
       R['accel']+= 1/(S['speedX']+.1)

    # Brake Control
    R['brake']= 0
    if ahead >= 0 and S['speedX'] > allowed_speed:
        R['brake']= min(1, (S['speedX']-allowed_speed)*brake_gain)
        R['accel']= 0

    # ABS: halve the brake if any wheel turns 20% slower than the car moves (locking).
    if R['brake'] > 0 and S['speedX'] > 20:
        slowest_wheel= min(S['wheelSpinVel'])*.3   # rad/s * ~0.3 m wheel radius = m/s
        if slowest_wheel < .8*S['speedX']/3.6:
            R['brake']*= .5

    # Throttle Near Full Lock: at full lock the car is already turning as tight
    # as it can, so more speed only pushes it wide (v0.28: throttle 1.0 at full
    # lock in the ~3,283 m hairpin ran the car out to trackPos -0.92). Above
    # lock_steer the throttle is limited, falling linearly to lock_throttle at
    # full lock. The stored throttle is limited too, so it cannot wind up and
    # snap open as the wheel straightens; it climbs back at +0.05 per step.
    lock= clip((abs(R['steer'])-lock_steer)/(1-lock_steer), 0, 1)   # 0 below lock_steer, 1 at full lock
    R['accel']= min(R['accel'], 1 - lock*(1-lock_throttle))

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
    w= S['wheelSpinVel']
    rear_over= (w[2]+w[3])/2*.315 - (w[0]+w[1])/2*.302
    c.throttle= clip(R['accel'], 0, 1)
    c.tc_cut= max(clip((rear_over-tc_slip)*tc_gain, 0, 1), getattr(c, 'tc_cut', 0)*tc_hold)
    R['accel']= c.throttle - c.tc_cut

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
