/* Run viewer. Data comes from data/index.js (track outline, version list) and data/<id>.js (one run each),
   both written by build.py. New map features go into LAYERS: each entry gets a switch and an opacity slider. */
if(!window.RV_INDEX){document.getElementById('nodata').style.display='block';throw new Error('run build.py first')}
const D=window.RV_INDEX;window.RUNDATA=window.RUNDATA||{};
const V=D.versions,ANG=D.angles,TOTAL=D.total,$=id=>document.getElementById(id),byId={};V.forEach((v,k)=>{byId[v.id]=v;v.n=k});
const dpr=()=>window.devicePixelRatio||1;
const SIDE=400;               /* width of the side panel on the Track tab, as in viewer.css */
const COLS=['#3987e5','#d95926','#199e70','#c98500','#d55181','#9085e9'];      /* one colour per selected run */
let SEL=[],SELC={};            /* selected run ids (first = reference) and their colours */
let R=null,CM=[];              /* loaded reference run and compared runs [{r,col,id}] */
let i=0,t=0,playing=true,last=null,holdDir=0,holdStart=0,holdRate=0,tab='pv',chartsDirty=true,hoverD=null;
let mode='simple';try{mode=localStorage.getItem('rv_mode')||'simple'}catch(e){}
let listMode='all',keptOnly=true,detailId=null;
const simple=()=>mode==='simple';
const view={z:3.2,ox:0,oy:0,cx:0,cy:0,follow:true,rot:true,all:false,sInit:false,sz:3.2,scx:0,scy:0,ang:0,maxAll:10};   /* maxAll: closest zoom the keep-all camera may use, px per metre */
let lastCam=null;            /* base point, centre, angle and zoom of the last drawn frame */
let cam=null;                /* world-to-screen of the last drawn frame, for hit-testing clicks */
const opt={line:'full',lineW:3,sync:'t'};
const c=$('c'),g=c.getContext('2d'),mini=$('mini'),mg=mini.getContext('2d');

/* ---------- helpers ---------- */
function fmtLap(s){if(s==null)return 'no lap';const m=Math.floor(s/60),r=s-m*60;return m+':'+(r<10?'0':'')+r.toFixed(2).replace('.',':')}
function sgn(x,d){return (x>=0?'+':'')+x.toFixed(d)}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')}
function beamCol(d,a){return 'hsla('+Math.max(0,Math.min(120,d/200*120))+',90%,50%,'+a+')'}
function bsearch(arr,v){let lo=0,hi=arr.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(arr[m]<=v)lo=m;else hi=m-1}return lo}
const idxAtD=(r,d)=>bsearch(r.d,d),idxAtT=(r,tt)=>bsearch(r.t,tt);
function ghostIdx(r){return opt.sync==='t'?idxAtT(r,R.t[i]):idxAtD(r,R.d[i])}
let vmin=0,vmax=1;const NB=32;
function speedRange(){vmin=1e9;vmax=-1e9;delete R._bk;for(const v of R.v){if(v<vmin)vmin=v;if(v>vmax)vmax=v}}
function buckets(r){if(r._bk)return r._bk;const bk=[];for(let k=0;k<NB;k++)bk.push([]);r._bk=bk;
 for(let k=0;k<r.x.length-1;k++){const f=((r.v[k]+r.v[k+1])/2-vmin)/(vmax-vmin||1);bk[Math.max(0,Math.min(NB-1,Math.floor(f*NB)))].push(k)}return bk}

/* ---------- loading and selection ---------- */
function loadRun(id,cb){if(RUNDATA[id])return cb();$('msg').textContent='Loading '+id+' ...';
 const s=document.createElement('script');s.src=D.dataDir+'/'+byId[id].file;
 s.onload=()=>{$('msg').textContent='';cb()};s.onerror=()=>{$('msg').textContent='Could not load the data file for '+id+'. Run build.py again.'};document.head.appendChild(s)}
function applySel(then){const ids=SEL.slice();let left=ids.length;if(!left)return;
 ids.forEach(id=>loadRun(id,()=>{if(--left>0||SEL.join()!==ids.join())return;
  const had=!!R;R=RUNDATA[SEL[0]];CM=SEL.slice(1).map(x=>({r:RUNDATA[x],col:SELC[x],id:x}));t=had?Math.max(R.t[0],Math.min(t,R.t[R.x.length-1])):R.t[0];i=had?idxAtT(R,t):0;view.sInit=false;afterSelect();if(then)then()}))}
function freeCol(){return COLS.find(k=>!Object.values(SELC).includes(k))}
function addSel(id){if(SEL.includes(id)||!byId[id].file)return false;if(SEL.length>=COLS.length){flash('At most '+COLS.length+' runs can be shown together. Remove one first.');return false}SELC[id]=freeCol();SEL.push(id);return true}
function dropSel(id){if(SEL.length<2||!SEL.includes(id))return;SEL=SEL.filter(x=>x!==id);delete SELC[id]}
function toggleSel(id){if(SEL.includes(id))dropSel(id);else addSel(id);applySel()}
function makeRef(id,then){if(!SEL.includes(id)&&!addSel(id))return;SEL=[id].concat(SEL.filter(x=>x!==id));applySel(then)}
function only(id,then){SEL=[];SELC={};addSel(id);applySel(then)}
function flash(m){const T=$('tip');T.textContent=m;T.style.display='block';T.style.left='50%';T.style.top='60px';setTimeout(()=>{T.style.display='none'},2600)}
function chips(){$('chips').innerHTML=SEL.map((id,k)=>'<div class="chip" data-f="'+id+'" title="'+(k===0?'The car in focus':'Click to put this car in focus')+'" style="cursor:'+(k===0?'default':'pointer')+'"><i style="background:'+SELC[id]+'"></i><b class="num">'+id+'</b><span class="num">'+fmtLap(byId[id].sum?byId[id].sum.lap:byId[id].lap)+'</span>'+(k===0&&SEL.length>1?'<em>in focus</em>':'')+
  (SEL.length>1?'<button data-x="'+id+'" title="Remove from the selection">x</button>':'')+'</div>').join('');
 $('chips').querySelectorAll('button').forEach(b=>b.onclick=e=>{e.stopPropagation();dropSel(b.dataset.x);applySel()});$('chips').querySelectorAll('.chip').forEach(d=>d.onclick=()=>{if(d.dataset.f!==SEL[0])makeRef(d.dataset.f)});$('clr').style.display=SEL.length>1?'':'none'}
$('clr').onclick=()=>only(SEL[0]);
function afterSelect(){speedRange();$('scrub').max=R.x.length-1;chips();buildGap();legend();buildSide();buildTelemetry();renderVersions();chartsDirty=true}

/* ---------- map layers: add future features here; each gets a switch and an opacity slider ----------
   g = group heading in the Advanced panel, d = one-line description, cmp = only shown while runs are compared */
function poly(ctx,Pn){ctx.beginPath();ctx.moveTo(Pn[0][0],Pn[0][1]);for(const p of Pn)ctx.lineTo(p[0],p[1])}
function lineRange(r,me){const n=r.x.length;let k0=0,k1=n-2;if(opt.line==='upto')k1=Math.min(k1,me-1);if(opt.line==='near'){k0=idxAtD(r,r.d[me]-150);k1=Math.min(k1,idxAtD(r,r.d[me]+150))}return [k0,k1]}
function drawSolid(ctx,r,me,w,col){const q=lineRange(r,me);if(q[1]<q[0])return;ctx.lineWidth=w;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=col;ctx.beginPath();ctx.moveTo(r.x[q[0]],r.y[q[0]]);for(let k=q[0]+1;k<=q[1]+1;k++)ctx.lineTo(r.x[k],r.y[k]);ctx.stroke()}
function drawSpeedLine(ctx,r,z,w){const q=lineRange(r,i),bk=buckets(r);ctx.lineWidth=w/z;ctx.lineCap='round';ctx.lineJoin='round';
 for(let b=0;b<NB;b++){const L=bk[b];if(!L.length)continue;ctx.beginPath();let any=false;for(const k of L){if(k<q[0]||k>q[1])continue;ctx.moveTo(r.x[k],r.y[k]);ctx.lineTo(r.x[k+1],r.y[k+1]);any=true}
  if(any){ctx.strokeStyle='hsl('+(b+0.5)/NB*120+',90%,50%)';ctx.stroke()}}}
/* car1-ow1 from above: 4.8 m long, front axle 1.6 m ahead of the centre, rear axle 1.35 m behind, front wheels 0.70 m and rear wheels 0.75 m
   either side, tyres 0.30 m wide. Front wheels turn with the recorded steering (full lock 21 degrees). Never drawn smaller than ~16 px. */
function drawCar(ctx,r,k,fill,z){const sc=Math.max(1,16/(4.8*z));ctx.save();ctx.translate(r.x[k],r.y[k]);ctx.rotate(r.yaw[k]);ctx.scale(sc,sc);const lw=0.05;
 ctx.strokeStyle='#8f8e86';ctx.lineWidth=0.06;ctx.beginPath();for(const w of [[1.6,0.70],[1.6,-0.70],[-1.35,0.75],[-1.35,-0.75]]){ctx.moveTo(w[0]+0.12,w[1]>0?0.2:-0.2);ctx.lineTo(w[0],w[1]);ctx.moveTo(w[0]-0.3,w[1]>0?0.25:-0.25);ctx.lineTo(w[0],w[1])}ctx.stroke();
 const wheel=(x,y,len,ang)=>{ctx.save();ctx.translate(x,y);ctx.rotate(ang);ctx.fillStyle='#0b0b0b';ctx.strokeStyle='#a9a89f';ctx.lineWidth=lw;ctx.beginPath();ctx.rect(-len/2,-0.15,len,0.30);ctx.fill();ctx.stroke();ctx.restore()};
 const sa=(r.st[k]||0)*21*Math.PI/180;wheel(1.6,0.70,0.60,sa);wheel(1.6,-0.70,0.60,sa);wheel(-1.35,0.75,0.63,0);wheel(-1.35,-0.75,0.63,0);
 ctx.fillStyle=fill;ctx.strokeStyle='#161615';ctx.lineWidth=lw;
 ctx.beginPath();ctx.rect(2.0,-0.85,0.36,1.70);ctx.fill();ctx.stroke();                 /* front wing */
 ctx.beginPath();ctx.rect(-2.4,-0.55,0.38,1.10);ctx.fill();ctx.stroke();                /* rear wing */
 ctx.beginPath();ctx.moveTo(2.3,0.10);ctx.lineTo(0.95,0.22);ctx.lineTo(0.6,0.62);ctx.lineTo(-0.95,0.62);ctx.lineTo(-2.0,0.24);ctx.lineTo(-2.0,-0.24);ctx.lineTo(-0.95,-0.62);ctx.lineTo(0.6,-0.62);ctx.lineTo(0.95,-0.22);ctx.lineTo(2.3,-0.10);ctx.closePath();ctx.fill();ctx.stroke();
 ctx.fillStyle='#161615';ctx.beginPath();ctx.ellipse(0.15,0,0.55,0.24,0,0,7);ctx.fill();ctx.fillStyle='#f2f1ec';ctx.beginPath();ctx.arc(0.05,0,0.15,0,7);ctx.fill();ctx.restore()}
const LAYERS=[
 {id:'road',g:'Track',label:'Road surface',d:'The grey area of the road.',on:true,alpha:1,draw(ctx,z){ctx.beginPath();ctx.moveTo(D.left[0][0],D.left[0][1]);for(const p of D.left)ctx.lineTo(p[0],p[1]);
   for(let k=D.right.length-1;k>=0;k--)ctx.lineTo(D.right[k][0],D.right[k][1]);ctx.closePath();ctx.fillStyle='#2f2f33';ctx.fill('evenodd')}},
 {id:'edges',g:'Track',label:'Track edges',d:'The white lines at both sides. Beyond them the car is off the track.',on:true,alpha:1,draw(ctx,z){ctx.lineWidth=1.4/z;ctx.strokeStyle='#e6e4dc';poly(ctx,D.left);ctx.stroke();poly(ctx,D.right);ctx.stroke()}},
 {id:'centre',g:'Track',label:'Centre line',d:'Dashed line down the middle of the road (track position 0).',on:false,alpha:.6,draw(ctx,z){ctx.setLineDash([6/z,6/z]);ctx.lineWidth=1/z;ctx.strokeStyle='#e6e4dc';poly(ctx,D.centre);ctx.stroke();ctx.setLineDash([])}},
 {id:'marks',g:'Track',label:'Distance marks',d:'A tick and a label every 100 m from the start line.',on:true,alpha:.7,draw(ctx,z){ctx.lineWidth=1/z;ctx.strokeStyle='#85847b';ctx.beginPath();for(const m of D.marks){ctx.moveTo(m[1],m[2]);ctx.lineTo(m[3],m[4])}ctx.stroke()},
   screen(ctx,w2s){if(view.z<0.5)return;ctx.fillStyle='#bdbcb2';ctx.font='11px "Segoe UI",system-ui';for(const m of D.marks){const p=w2s(m[1],m[2]);if(p[0]>-40&&p[0]<c.clientWidth+40&&p[1]>-20&&p[1]<c.clientHeight+20)ctx.fillText(m[0]+' m',p[0]+4,p[1]-4)}}},
 {id:'line',g:'Car and path',label:'Driven line',d:'Where the reference car drove, coloured by its speed: red slowest, green fastest.',on:true,alpha:1,draw(ctx,z){drawSpeedLine(ctx,R,z,opt.lineW)}},
 {id:'car',g:'Car and path',label:'Car',d:'The car in focus: car1-ow1, the open-wheel car the driver runs, drawn to scale. Its front wheels turn with the recorded steering.',on:true,alpha:1,draw(ctx,z){drawCar(ctx,R,i,SELC[SEL[0]],z)}},
 {id:'speed',g:'Car and path',label:'Speed label',d:'The current speed, written next to the car.',on:true,alpha:1,draw(){},screen(ctx,w2s){const p=w2s(R.x[i],R.y[i]);ctx.font='600 13px "Segoe UI",system-ui';const s=R.v[i].toFixed(0)+' km/h';
   const w=ctx.measureText(s).width;const o=12+1.3*view.z;ctx.fillStyle='#161615dd';ctx.fillRect(p[0]+o,p[1]-9,w+10,18);ctx.fillStyle='#fff';ctx.fillText(s,p[0]+o+5,p[1]+4)}},
 {id:'beams',g:'Sensors',label:'Track beams',d:'The 19 distance sensors. Each line runs from the car to the track edge it measures; red is close, green is far, faint means nothing within 200 m.',on:true,alpha:.95,draw(ctx,z){if(!R.beams)return;const o=i*19;for(let k=0;k<19;k++){const d=R.b[o+k];if(d<0)continue;const a=R.yaw[i]-ANG[k]*Math.PI/180,hit=d<199.5;
   ctx.beginPath();ctx.moveTo(R.x[i],R.y[i]);ctx.lineTo(R.x[i]+d*Math.cos(a),R.y[i]+d*Math.sin(a));ctx.lineWidth=(hit?1.6:1)/z;ctx.strokeStyle=beamCol(d,hit?1:.3);ctx.stroke()}}},
 {id:'hits',g:'Sensors',label:'Beam end points',d:'A dot where each beam meets the track edge.',on:true,alpha:1,draw(ctx,z){if(!R.beams)return;const o=i*19;for(let k=0;k<19;k++){const d=R.b[o+k];if(d<0||d>=199.5)continue;const a=R.yaw[i]-ANG[k]*Math.PI/180;
   ctx.beginPath();ctx.arc(R.x[i]+d*Math.cos(a),R.y[i]+d*Math.sin(a),3.2/z,0,7);ctx.fillStyle=beamCol(d,1);ctx.fill()}}},
 {id:'focus',g:'Sensors',label:'Focus rays',d:'Five extra rays the car can aim once a second (used from v1.04). Dashed; shown briefly when a look is taken.',on:true,alpha:1,draw(ctx,z){let q=null,fk=0;for(let k=i;k>=Math.max(0,i-12);k--){if(R.foc[k]){q=R.foc[k];fk=k;break}}if(!q)return;
   ctx.globalAlpha*=(1-(i-fk)/14);ctx.setLineDash([5/z,4/z]);for(let k=0;k<5;k++){const d=q[k+1];if(d<0)continue;const a=R.yaw[fk]-(q[0]+k-2)*Math.PI/180,ex=R.x[fk]+d*Math.cos(a),ey=R.y[fk]+d*Math.sin(a);
    ctx.beginPath();ctx.moveTo(R.x[fk],R.y[fk]);ctx.lineTo(ex,ey);ctx.lineWidth=2/z;ctx.strokeStyle=beamCol(d,1);ctx.stroke();
    if(d<199.5){ctx.save();ctx.setLineDash([]);ctx.beginPath();ctx.arc(ex,ey,4/z,0,7);ctx.strokeStyle='#fff';ctx.lineWidth=1.2/z;ctx.stroke();ctx.restore()}}ctx.setLineDash([])}},
 {id:'lineB',g:'Compared runs',label:'Their driven lines',d:'The path of each compared run, in that run\'s colour.',on:true,alpha:.9,cmp:true,draw(ctx,z){for(const m of CM){const k=ghostIdx(m.r);drawSolid(ctx,m.r,k,(opt.lineW*0.6+2)/z,'#161615');drawSolid(ctx,m.r,k,opt.lineW*0.6/z,m.col)}}},
 {id:'ghost',g:'Compared runs',label:'Their cars',d:'One car per compared run, in that run\'s colour.',on:true,alpha:.9,cmp:true,draw(ctx,z){for(const m of CM)drawCar(ctx,m.r,ghostIdx(m.r),m.col,z)}},
];
const LY={};LAYERS.forEach(L=>{LY[L.id]=L;L.on0=L.on;L.alpha0=L.alpha});
const DRAW=LAYERS.filter(L=>L.id!=='car').concat(LAYERS.filter(L=>L.id==='car'));   /* the car in focus is drawn last, on top */
const OVER=[{id:'hud',label:'Readout',d:'The box of numbers, top left.',on:true},{id:'mini',label:'Overview map',d:'The small map of the whole track.',on:true},{id:'leg',label:'Colour keys',d:'What the colours mean, bottom left.',on:true}];
const GROUPS=['Track','Car and path','Sensors','Compared runs'];

/* ---------- side panel ---------- */
function el(tag,cls,html){const e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e}
function chk(label,on,fn){const l=el('label',null,'<input type="checkbox" '+(on?'checked':'')+'><span>'+label+'</span>');l.firstChild.onchange=e=>fn(e.target.checked);return l}
function toggleRow(name,desc,on,fn){const r=el('div','lr'+(on?'':' off'),'<label class="tg"><input type="checkbox" '+(on?'checked':'')+'><span></span></label><div><div class="ln">'+name+'</div><div class="ld">'+desc+'</div></div>');
 r.querySelector('input').onchange=e=>{r.classList.toggle('off',!e.target.checked);fn(e.target.checked)};return r}
function slider(row,label,min,max,step,val,fmt,fn){const o=el('div','lo','<small>'+label+'</small><input type="range" min="'+min+'" max="'+max+'" step="'+step+'" value="'+val+'"><span class="num">'+fmt(val)+'</span>');
 o.querySelector('input').oninput=e=>{o.lastChild.textContent=fmt(+e.target.value);fn(+e.target.value)};row.appendChild(o);return o.querySelector('input')}
function segs(items,cur,fn){const s=el('div','seg sm');for(const it of items){const b=el('button',it[0]===cur?'on':null,it[1]);b.onclick=()=>{s.querySelectorAll('button').forEach(x=>x.classList.remove('on'));b.classList.add('on');fn(it[0])};s.appendChild(b)}return s}
let zoomInput=null,carCells=[];
/* the selected cars as a table at the top of the side panel: shows which one is in focus; click a row to focus that car */
function carsTable(){const gp=el('div','grp','<h3>Cars</h3>');const tb=el('table','cars');
 tb.innerHTML='<thead><tr><th class="l">Version</th><th>Lap time</th><th>'+(simple()?'Position':'Gap')+'</th><th>Speed</th></tr></thead><tbody></tbody>';
 SEL.forEach((id,k)=>{const tr=el('tr',k===0?'foc':null,'<td class="l"><i style="background:'+SELC[id]+'"></i><b>'+id+'</b></td><td class="num">'+fmtLap(RUNDATA[id].sum.lap)+'</td><td class="num"></td><td class="num"></td>');
  if(k>0){tr.onclick=()=>makeRef(id);tr.title='Put '+id+' in focus'}tb.lastChild.appendChild(tr);carCells.push({r:RUNDATA[id],gap:tr.cells[2],spd:tr.cells[3],foc:k===0})});
 gp.appendChild(tb);gp.appendChild(el('div','note','Click a row to put that car in focus. '+(simple()?'Position':'Gap')+' is measured against the car in focus, at the same point on the track.'));return gp}
function buildSide(){const s=$('side');s.innerHTML='';zoomInput=null;carCells=[];if(CM.length)s.appendChild(carsTable());
 if(simple()){s.appendChild(el('div','grp','<h3>What you are looking at</h3><div class="guide"><p>The car replays the recorded lap of the selected version.</p>'+
   '<p>The coloured path is the line the car drove. Red is where it was slowest, green where it was fastest.</p>'+
   '<p>The lines fanning out from the car are its sensors. Each one measures how far it is to the edge of the road in that direction: red means the edge is close, green means it is far away.</p>'+
   (R&&!R.beams?'<p class="note">This early version did not record its sensors, so only the path is shown.</p>':'')+'</div>'));
  const sh=el('div','grp','<h3>Show</h3>');s.appendChild(sh);
  sh.appendChild(toggleRow('Sensor beams','The lines from the car to the edges of the road.',LY.beams.on,v=>{LY.beams.on=LY.hits.on=LY.focus.on=v}));
  sh.appendChild(toggleRow('Driven path','The line the car drove, coloured by its speed.',LY.line.on,v=>LY.line.on=v));
  sh.appendChild(toggleRow('Distance marks','A label every 100 m along the track.',LY.marks.on,v=>LY.marks.on=v));
  if(CM.length)sh.appendChild(toggleRow('The other cars','The cars and paths of the other selected versions.',LY.ghost.on,v=>{LY.ghost.on=LY.lineB.on=v}));
  const cg=el('div','grp','<h3>Camera</h3>');s.appendChild(cg);
  cg.appendChild(toggleRow('Follow car','Keeps the car in the middle of the view.',view.follow,setFollow));
  if(CM.length)cg.appendChild(toggleRow('Keep all cars in view','Zooms out as far as needed to show every selected car.',view.all,setAll));
  if(CM.length&&view.all)cg.appendChild(maxZoomRow('How far the view may zoom in when the cars are close together.'));
  cg.appendChild(toggleRow('Car points up','Turns the map so the car always drives toward the top.',view.rot,setRot));
  const br=el('div','btnrow');const b1=el('button',null,'Back to the car'),b2=el('button',null,'Show the whole track');b1.onclick=resetView;b2.onclick=fitView;br.appendChild(b1);br.appendChild(b2);cg.appendChild(br);
  s.appendChild(el('div','grp','<h3>Moving around</h3><div class="guide"><p>Drag to move the map and use the mouse wheel to zoom. Double-click to return to the car.</p>'+
   (CM.length?'<p>Click another car, or its name at the top, to put that car in focus.</p>':'')+
   '<p>Press <kbd>Space</kbd> to play or pause. Tap an arrow key to move one moment at a time, or hold it down to play slowly.</p></div>'));return}
 /* advanced */
 const cg=el('div','grp','<h3>Camera</h3>');s.appendChild(cg);
 cg.appendChild(toggleRow('Follow car','Keeps the car in focus in the same place on screen. Switches off by itself when you drag the map.',view.follow,setFollow));
 if(CM.length)cg.appendChild(toggleRow('Keep all cars in view','Moves and zooms the map so every selected car stays on screen. Needs Follow car, and sets the zoom itself.',view.all,setAll));
 cg.appendChild(toggleRow('Car points up','Rotates the map so the car in focus always drives toward the top. Turn off for a fixed map.',view.rot,setRot));
 if(CM.length)cg.appendChild(el('div','note','Click a car on the map, its row in the Cars table above, or its name in the top bar, to put it in focus.'));
 if(view.all&&CM.length){cg.appendChild(maxZoomRow('The view zooms out as far as needed to show every car, and never closer than this. The mouse wheel and the zoom keys are off in this mode.'))}else{const zr=el('div','lr','<span></span><div><div class="ln">Zoom</div><div class="ld">Also the mouse wheel, or the + and - keys.</div></div>');cg.appendChild(zr);
 zoomInput=slider(zr,'',-2.5,4,0.01,Math.log(view.z).toFixed(2),v=>Math.exp(v).toFixed(1)+' px/m',v=>{const b=base();zoomAt(b[0]+view.ox,b[1]+view.oy,Math.exp(v)/view.z)});zoomInput._fmt=v=>Math.exp(v).toFixed(1)+' px/m'}
 const br=el('div','btnrow');const b1=el('button',null,'Back to the car'),b2=el('button',null,'Whole track');b1.onclick=resetView;b2.onclick=fitView;br.appendChild(b1);br.appendChild(b2);cg.appendChild(br);
 for(const G of GROUPS){const Ls=LAYERS.filter(L=>L.g===G);if(G==='Compared runs'&&!CM.length)continue;const gp=el('div','grp','<h3>'+G+'</h3>');s.appendChild(gp);
  for(const L of Ls){const r=toggleRow(L.label,L.d,L.on,v=>L.on=v);slider(r,'Opacity',0,1,0.05,L.alpha,v=>Math.round(v*100)+' %',v=>L.alpha=v);gp.appendChild(r);
   if(L.id==='line'){const o=el('div','opt','<div class="cap">How much of the line to draw</div>');o.appendChild(segs([['full','Whole lap'],['upto','Up to the car'],['near','Near the car']],opt.line,v=>opt.line=v));
    const w=el('div','lr');w.style.gridTemplateColumns='0 1fr';w.style.padding='4px 0 0';w.appendChild(el('span'));slider(w,'Width',1,8,0.5,opt.lineW,v=>v.toFixed(1)+' px',v=>opt.lineW=v);o.appendChild(w);gp.appendChild(o)}}
  if(G==='Compared runs'){const o=el('div','opt','<div class="cap">Where the other cars are placed. Same lap time shows who is ahead; same distance shows the difference in line.</div>');
   o.appendChild(segs([['t','Same lap time'],['d','Same distance']],opt.sync,v=>opt.sync=v));gp.appendChild(o)}}
 const pn=el('div','grp','<h3>Panels on the map</h3>');s.appendChild(pn);
 for(const L of OVER)pn.appendChild(toggleRow(L.label,L.d,L.on,v=>{L.on=v;$(L.id).style.display=v?'':'none'}));
 const rs=el('div','grp');const rb=el('button',null,'Restore the default layers');rb.onclick=()=>{LAYERS.forEach(L=>{L.on=L.on0;L.alpha=L.alpha0});OVER.forEach(L=>{L.on=true;$(L.id).style.display=''});opt.line='full';opt.lineW=3;buildSide()};rs.appendChild(rb);s.appendChild(rs);
 s.appendChild(el('div','grp','<h3>Keys</h3><div class="note"><kbd>Left</kbd> <kbd>Right</kbd> one step; hold for 0.1x, then 0.25x, then 0.5x<br><kbd>Space</kbd> play or pause<br><kbd>+</kbd> <kbd>-</kbd> zoom, <kbd>F</kbd> follow, <kbd>Home</kbd> start<br>Drag to pan, double-click to return to the car</div>'))}

/* ---------- map drawing ---------- */
function size(){const r=dpr();c.width=c.clientWidth*r;c.height=c.clientHeight*r}
let progDirty=true;
addEventListener('resize',()=>{size();chartsDirty=true;progDirty=true});
let bx0=1e9,bx1=-1e9,by0=1e9,by1=-1e9;for(const p of D.left.concat(D.right)){bx0=Math.min(bx0,p[0]);bx1=Math.max(bx1,p[0]);by0=Math.min(by0,p[1]);by1=Math.max(by1,p[1])}
function base(){const W=c.clientWidth-SIDE,H=c.clientHeight;return [W/2,(view.follow&&view.rot)?H*0.64:H/2]}
function carsNow(){return [{id:SEL[0],x:R.x[i],y:R.y[i]}].concat(CM.map(m=>{const k=ghostIdx(m.r);return {id:m.id,x:m.r.x[k],y:m.r.y[k]}}))}
/* centre and zoom that keep every selected car on screen, in the frame rotated by a; smoothed so it does not jump */
function frameAll(a,W,H){const ca=Math.cos(a),sa=Math.sin(a);let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;for(const p of carsNow()){const rx=p.x*ca-p.y*sa,ry=p.x*sa+p.y*ca;x0=Math.min(x0,rx);x1=Math.max(x1,rx);y0=Math.min(y0,ry);y1=Math.max(y1,ry)}
 const mx=(x0+x1)/2,my=(y0+y1)/2,cx=mx*ca+my*sa,cy=-mx*sa+my*ca,zt=Math.max(0.08,Math.min(view.maxAll,Math.min((W-200)/Math.max(x1-x0,1),(H-220)/Math.max(y1-y0,1))));
 if(!view.sInit){view.sz=zt;view.scx=cx;view.scy=cy;view.sInit=true}else{view.sz+=(zt-view.sz)*0.12;view.scx+=(cx-view.scx)*0.3;view.scy+=(cy-view.scy)*0.3}return [[view.scx,view.scy],view.sz]}
function drawMap(){const r=dpr(),W=c.clientWidth,H=c.clientHeight,a=view.rot?Math.PI/2-R.yaw[i]:view.ang;let b=base(),ce=view.follow?[R.x[i],R.y[i]]:[view.cx,view.cy];
 if(view.follow&&view.all&&CM.length){const f=frameAll(a,W-SIDE,H);ce=f[0];view.z=f[1];b=[(W-SIDE)/2,H/2]}const z=view.z;lastCam={b:b,ce:ce,a:a,z:z};
 g.setTransform(r,0,0,r,0,0);g.fillStyle='#161615';g.fillRect(0,0,W,H);
 g.translate(b[0]+view.ox,b[1]+view.oy);g.scale(z,-z);g.rotate(a);g.translate(-ce[0],-ce[1]);
 for(const L of DRAW){if(!L.on||(L.cmp&&!CM.length))continue;g.globalAlpha=L.alpha;L.draw(g,z)}
 g.globalAlpha=1;g.setTransform(r,0,0,r,0,0);const ca=Math.cos(a),sa=Math.sin(a);
 const w2s=(x,y)=>{const dx=x-ce[0],dy=y-ce[1];return [b[0]+view.ox+(dx*ca-dy*sa)*z,b[1]+view.oy-(dx*sa+dy*ca)*z]};cam=w2s;
 for(const L of LAYERS){if(L.on&&L.screen&&!(L.cmp&&!CM.length)){g.globalAlpha=L.alpha;L.screen(g,w2s)}}g.globalAlpha=1;
 for(const q of carCells){if(q.foc){q.gap.textContent='in focus';q.spd.textContent=R.v[i].toFixed(0)+' km/h'}else{const gp=q.r.t[idxAtD(q.r,R.d[i])]-R.t[i];
   q.gap.textContent=simple()?(Math.abs(gp)<0.005?'level':Math.abs(gp).toFixed(2)+' s '+(gp>0?'behind':'ahead')):sgn(gp,2)+' s';q.spd.textContent=q.r.v[ghostIdx(q.r)].toFixed(0)+' km/h'}}
 if(zoomInput&&document.activeElement!==zoomInput){const lv=Math.log(z).toFixed(2);if(zoomInput.value!==lv){zoomInput.value=lv;zoomInput.nextSibling.textContent=zoomInput._fmt(+lv)}}
 if(OVER[1].on){const mw=mini.width,mh=mini.height,ms=Math.min((mw-16)/(bx1-bx0),(mh-16)/(by1-by0));
  mg.setTransform(1,0,0,1,0,0);mg.clearRect(0,0,mw,mh);mg.translate(mw/2,mh/2);mg.scale(ms,-ms);mg.translate(-(bx0+bx1)/2,-(by0+by1)/2);
  mg.lineWidth=1/ms;mg.strokeStyle='#85847b';poly(mg,D.left);mg.stroke();poly(mg,D.right);mg.stroke();
  for(const m of CM){const k=ghostIdx(m.r);mg.beginPath();mg.arc(m.r.x[k],m.r.y[k],4/ms,0,7);mg.fillStyle=m.col;mg.fill()}
  mg.beginPath();mg.arc(R.x[i],R.y[i],4.5/ms,0,7);mg.fillStyle=SELC[SEL[0]];mg.fill()}
 if(OVER[0].on){const kv=[];const add=(k,v)=>kv.push('<span>'+k+'</span><b class="num">'+v+'</b>');
  add('Lap time',R.t[i].toFixed(2)+' s');add('Distance',R.s[i].toFixed(0)+' m');
  if(simple()){add('Doing',R.br[i]>0?'Braking':R.th[i]>=0.99?'Full throttle':R.th[i]>0.05?'Part throttle':'Coasting')}
  else{add('Gear',R.g[i]);add('Plan allows',R.al[i]>350||!R.al[i]?'no limit':R.al[i].toFixed(0)+' km/h');add('Throttle',R.th[i].toFixed(2));add('Brake',R.br[i].toFixed(2));add('Steering',R.st[i].toFixed(2));add('Track position',R.tp[i].toFixed(2));
   if(R.beams){let mn=1e9,mx=-1;for(let k=0;k<19;k++){const d=R.b[i*19+k];if(d>=0){mn=Math.min(mn,d);mx=Math.max(mx,d)}}add('Beams',mx<0?'off track':mn.toFixed(0)+' to '+mx.toFixed(0)+' m')}}
  for(const m of CM){const k=idxAtD(m.r,R.d[i]),gap=m.r.t[k]-R.t[i];add('<i style="display:inline-block;width:8px;height:8px;background:'+m.col+'"></i> '+m.id,
   (simple()?(Math.abs(gap)<0.005?'level':Math.abs(gap).toFixed(2)+' s '+(gap>0?'behind':'ahead')):sgn(gap,2)+' s &nbsp; '+m.r.v[ghostIdx(m.r)].toFixed(0)+' km/h'))}
  $('hud').innerHTML='<div class="big num">'+R.v[i].toFixed(0)+' <small>km/h &nbsp; '+R.name+'</small></div><div class="kv">'+kv.join('')+'</div>';$('mini').style.top=($('hud').offsetHeight+22)+'px'}}
function legend(){$('leg').innerHTML='<div>'+(simple()?'Path colour: speed':'Driven line: speed')+'</div><div class="grad"></div><div class="ends num"><span>'+vmin.toFixed(0)+'</span><span>km/h</span><span>'+vmax.toFixed(0)+'</span></div>'+
 (R.beams?'<div style="margin-top:6px">'+(simple()?'Sensor colour: distance to the road edge':'Beams: distance to the edge')+'</div><div class="grad"></div><div class="ends num"><span>0</span><span>m</span><span>200</span></div>':'')+
 (CM.length?'<div style="margin-top:6px">Compared runs</div>'+CM.map(m=>'<div><i style="display:inline-block;width:14px;height:3px;vertical-align:middle;background:'+m.col+'"></i> '+m.id+'</div>').join(''):'')}
let drag=null;
let moved=0;
/* freeze the view exactly as it is now and hand it to the user */
function detach(){if(!lastCam||(!view.follow&&!view.rot))return;const nb=[(c.clientWidth-SIDE)/2,c.clientHeight/2];view.ox=lastCam.b[0]+view.ox-nb[0];view.oy=lastCam.b[1]+view.oy-nb[1];
 view.cx=lastCam.ce[0];view.cy=lastCam.ce[1];view.ang=lastCam.a;view.z=lastCam.z;view.follow=false;view.rot=false;view.all=false;buildSide()}
function setRot(v){view.rot=v;view.ang=0}
function setAll(v){view.all=v;view.sInit=false;view.ox=view.oy=0;buildSide()}
/* slider for the closest zoom of the keep-all camera */
function maxZoomRow(desc){const r=el('div','lr','<span></span><div><div class="ln">Closest zoom</div><div class="ld">'+desc+'</div></div>');
 slider(r,'',0,3.7,0.01,Math.log(view.maxAll).toFixed(2),v=>Math.exp(v).toFixed(1)+' px/m',v=>{view.maxAll=Math.exp(v)});return r}
function carAt(e){if(!cam||!R)return null;const q=c.getBoundingClientRect(),mx=e.clientX-q.left,my=e.clientY-q.top;let best=null,bd=18;for(const p of carsNow()){const w=cam(p.x,p.y),d=Math.hypot(w[0]-mx,w[1]-my);if(d<bd){bd=d;best=p.id}}return best}
c.addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY];moved=0;c.setPointerCapture(e.pointerId);c.classList.add('drag')});
c.addEventListener('pointermove',e=>{if(!drag){const h=carAt(e);c.style.cursor=(h&&h!==SEL[0])?'pointer':'';return}moved+=Math.abs(e.clientX-drag[0])+Math.abs(e.clientY-drag[1]);if(moved>=5)detach();view.ox+=e.clientX-drag[0];view.oy+=e.clientY-drag[1];drag=[e.clientX,e.clientY]});
c.addEventListener('pointerup',e=>{drag=null;c.classList.remove('drag');if(moved<5){const h=carAt(e);if(h&&h!==SEL[0])makeRef(h)}});
function zoomAt(mx,my,k){const z2=Math.max(0.08,Math.min(55,view.z*k)),kk=z2/view.z,b=base();view.ox=(mx-b[0])*(1-kk)+view.ox*kk;view.oy=(my-b[1])*(1-kk)+view.oy*kk;view.z=z2}
const autoZoom=()=>view.follow&&view.all&&CM.length>0;   /* zoom is set by the keep-all camera: manual zoom is off */
/* wheel: no zoom while all cars are kept in view; around the car while following; around the pointer otherwise */
c.addEventListener('wheel',e=>{e.preventDefault();if(autoZoom())return;const k=Math.exp(-e.deltaY*0.0015);if(view.follow){const b=base();zoomAt(b[0]+view.ox,b[1]+view.oy,k)}else{const r=c.getBoundingClientRect();zoomAt(e.clientX-r.left,e.clientY-r.top,k)}},{passive:false});
function setFollow(v){if(v)view.ang=0;view.follow=v;if(!v&&R){view.cx=R.x[i];view.cy=R.y[i]}view.ox=view.oy=0}
function resetView(){view.follow=true;view.rot=true;view.all=false;view.z=3.2;view.ox=view.oy=0;buildSide()}
function fitView(){view.follow=false;view.rot=false;view.all=false;view.ang=0;view.cx=(bx0+bx1)/2;view.cy=(by0+by1)/2;view.ox=view.oy=0;const b=base();view.z=Math.min(b[0]*2/(bx1-bx0),c.clientHeight/(by1-by0))*0.92;buildSide()}
c.addEventListener('dblclick',resetView);

/* ---------- playback ---------- */
function go(k){i=Math.max(0,Math.min(R.x.length-1,k));t=R.t[i]}
function seekT(tt){const n=R.x.length;if(tt>=t){while(i<n-1&&R.t[i+1]<=tt)i++}else{while(i>0&&R.t[i]>tt)i--}t=tt}
function setPlaying(p){playing=p;$('play').textContent=p?'Pause':'Play'}
function hold(dir){if(!R)return;setPlaying(false);go(i+dir);holdDir=dir;holdStart=performance.now()}
function release(){holdDir=0;holdRate=0}
function tick(now){requestAnimationFrame(tick);if(last===null)last=now;const dt=Math.min(0.1,(now-last)/1000);last=now;
 if(tab==='pv'){drawProg();return}if(!R)return;const n=R.x.length;
 if(holdDir){const h=(now-holdStart)/1000;holdRate=h<0.45?0:h<1.6?0.1:h<3.2?0.25:0.5;
  if(holdRate)seekT(Math.max(R.t[0],Math.min(R.t[n-1],t+holdDir*dt*holdRate)))}
 else if(playing){const tt=t+dt*+$('spd').value;if(tt>=R.t[n-1]){i=0;t=R.t[0]}else seekT(tt)}
 $('rate').textContent=holdDir?(holdRate?(holdDir<0?'back ':'')+holdRate+'x, held':'one step'):(playing?$('spd').value+'x':'paused');
 $('scrub').value=i;$('pos').textContent=(simple()?'':'frame '+(i+1)+' of '+n+' · ')+R.s[i].toFixed(0)+' m · '+R.t[i].toFixed(2)+' s';
 if(tab==='pm')drawMap();else drawCharts()}
$('play').onclick=()=>setPlaying(!playing);$('scrub').oninput=e=>go(+e.target.value);
for(const [id,dir] of [['back',-1],['fwd',1]]){const b=$(id);b.addEventListener('pointerdown',e=>{b.setPointerCapture(e.pointerId);hold(dir)});b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release)}
addEventListener('keydown',e=>{if(tab==='pv')return;if(e.target.tagName==='SELECT'||e.target.type==='range'||e.target.type==='checkbox')e.target.blur();
 if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();if(!e.repeat)hold(e.key==='ArrowRight'?1:-1)}
 else if(e.key===' '){e.preventDefault();setPlaying(!playing)}
 else if(e.key==='+'||e.key==='='){if(!autoZoom())zoomAt(base()[0]+view.ox,base()[1]+view.oy,1.25)}else if(e.key==='-'){if(!autoZoom())zoomAt(base()[0]+view.ox,base()[1]+view.oy,0.8)}
 else if(e.key==='f'||e.key==='F'){setFollow(!view.follow);buildSide()}else if(e.key==='Home')go(0)});
addEventListener('keyup',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft')release()});addEventListener('blur',release);

/* ---------- versions tab ---------- */
const LISTS=[['all','All versions'],['fast','10 fastest laps'],['gain','10 biggest gains'],['loss','10 biggest losses'],['top','10 highest top speeds']];
/* each version against the best kept lap before it */
const LV=V.filter(v=>v.lap&&!v.extra);{let best=null;for(const v of LV){v.dbest=best==null?null:+(v.lap-best).toFixed(2);v.cls=!v.kept?(v.dbest!=null&&v.dbest<0?'rf':'rs'):(v.dbest==null||v.dbest<0?'kb':'ks');v.bestBefore=best;if(v.kept&&(best==null||v.lap<best))best=v.lap;v.bestAfter=best}}
const CLS={kb:['#0ca30c',true,'Kept, new best lap'],ks:['#fab219',true,'Kept, not a new best lap'],rf:['#0ca30c',false,'Rejected, although its single lap was faster'],rs:['#85847b',false,'Rejected, slower or equal']};
function listRows(){let a=V.filter(v=>!v.extra);if(listMode==='all')return V.slice().reverse();
 if(keptOnly)a=a.filter(v=>v.kept);
 if(listMode==='fast')return a.filter(v=>v.lap).sort((x,y)=>x.lap-y.lap).slice(0,10);
 if(listMode==='gain')return a.filter(v=>v.delta!=null&&v.delta<0).sort((x,y)=>x.delta-y.delta).slice(0,10);
 if(listMode==='loss')return a.filter(v=>v.delta!=null&&v.delta>0).sort((x,y)=>y.delta-x.delta).slice(0,10);
 return a.filter(v=>v.top).sort((x,y)=>y.top-x.top).slice(0,10)}
function status(v){return v.kept==null?'<span class="note">extra run</span>':'<span class="st '+(v.kept?'k':'r')+'"><i></i>'+(v.kept?'Kept':'Rejected')+'</span>'}
function deltaTxt(d){return simple()?(d===0?'the same':Math.abs(d).toFixed(2)+' s '+(d<0?'faster':'slower')):sgn(d,2)+' s'}
function deltaCell(d){if(d==null)return '<td></td>';return '<td class="num '+(d<0?'neg':d>0?'posd':'')+'">'+deltaTxt(d)+'</td>'}
function renderVersions(){const box=$('vmain');const sm=simple(),rank=listMode!=='all';
 const notes={all:'',
  fast:sm?'The ten quickest laps.':'Ten lowest single-lap times.',gain:sm?'The ten changes that cut the most time off the lap, compared with the best version before them.':'Largest lap-time reductions against the previous kept version.',
  loss:sm?'The ten changes that added the most time, compared with the best version before them.':'Largest lap-time increases against the previous kept version.',top:sm?'The ten highest top speeds.':'Ten highest top speeds.'};
 let h='<h3>'+(sm?'Lap time, version by version':'Lap time by version')+'</h3><canvas id="prog"></canvas>'+
  '<div class="key">'+Object.keys(CLS).map(k=>'<span><i style="'+(CLS[k][1]?'background:'+CLS[k][0]:'border:2px solid '+CLS[k][0])+'"></i>'+CLS[k][2]+'</span>').join('')+'<span><i class="ln"></i>Best lap so far</span></div>'+
  '<div class="note">'+(sm?'Each dot is one version; lower is faster. Point at a dot to see how it compares with the best lap before it. Use the mouse wheel over the chart to zoom in on the later versions.':'Hover for the difference to the best kept lap before each version. Wheel zooms the version axis, drag pans, double-click resets, click opens the details. Selected runs are ringed in their colour.')+'</div>'+
  '<div id="vbar"><div class="seg" id="lists">'+LISTS.map(l=>'<button data-l="'+l[0]+'" class="'+(l[0]===listMode?'on':'')+'">'+l[1]+'</button>').join('')+'</div>'+
  (rank?'<label><input type="checkbox" id="ko" '+(keptOnly?'checked':'')+'> Kept versions only</label>':'')+'</div><div class="note" style="margin-bottom:6px">'+notes[listMode]+(notes[listMode]?' ':'')+(sm?'Click a version to select it. To compare several, drag across them, or hold Shift and click to select everything in between, or hold Ctrl and click to add or remove one.':'Click selects one run. Drag or Shift-click selects a range, Ctrl-click adds or removes one (up to '+COLS.length+' runs). The run clicked first is in focus.')+'</div>';
 h+='<table id="vt"><thead><tr>'+(rank?'<th>#</th>':'')+'<th class="l">Version</th><th class="l">'+(sm?'What it changed':'Change')+'</th><th>Lap time</th><th>'+(sm?'Against the best before it':'vs best so far')+'</th>'+
  (sm?'':'<th>Top</th><th>Slowest corner</th>')+'<th class="l">Result</th><th class="l">Recording</th></tr></thead><tbody>';
 listRows().forEach((v,k)=>{h+='<tr data-id="'+v.id+'" class="'+(v.file?'':'nofile')+'">'+
  (rank?'<td class="num">'+(k+1)+'</td>':'')+'<td class="l num" style="color:var(--ink)">'+v.id+'</td><td class="l w">'+esc(sm&&v.st?v.st:v.title)+'</td><td class="num" style="color:var(--ink)">'+fmtLap(v.lap)+'</td>'+deltaCell(v.dbest)+
  (sm?'':'<td class="num">'+(v.top?v.top+' km/h':'')+'</td><td class="num">'+(v.slow?v.slow+' km/h':'')+'</td>')+'<td class="l">'+status(v)+'</td><td class="l note">'+(v.file?(v.beams?'path and sensors':'path only'):'none')+'</td></tr>'});
 const keep=box.scrollTop;box.innerHTML=h+'</tbody></table>';box.scrollTop=keep;
 box.querySelectorAll('#lists button').forEach(b=>b.onclick=()=>{listMode=b.dataset.l;renderVersions()});const ko=$('ko');if(ko)ko.onchange=e=>{keptOnly=e.target.checked;renderVersions()};
 paintRows();
 setupProg();renderDetail()}
/* selection in the table: click = that run only, Shift-click = range from the last clicked row, Ctrl-click = add or remove, drag = range */
let anchorId=null,dragSel=null;
function rangeIds(a,b){const ids=listRows().map(v=>v.id),x=ids.indexOf(a),y=ids.indexOf(b);if(x<0||y<0)return [b];return ids.slice(Math.min(x,y),Math.max(x,y)+1)}
function setSel(ids,first){ids=ids.filter(id=>byId[id]&&byId[id].file);if(first&&ids.includes(first))ids=[first].concat(ids.filter(x=>x!==first));if(!ids.length)return false;
 if(ids.length>COLS.length){ids=ids.slice(0,COLS.length);flash('Only '+COLS.length+' runs can be shown together; the first '+COLS.length+' of the range are selected.')}
 const nc={};ids.forEach(id=>{if(SELC[id])nc[id]=SELC[id]});ids.forEach(id=>{if(!nc[id])nc[id]=COLS.find(k=>!Object.values(nc).includes(k))});SEL=ids;SELC=nc;return true}
function paintRows(){document.querySelectorAll('#vt tbody tr').forEach(tr=>{const id=tr.dataset.id,on=SEL.includes(id);tr.classList.toggle('on',on);tr.cells[0].style.boxShadow=on?'inset 4px 0 0 '+SELC[id]:'';tr.classList.toggle('sel',id===detailId)});progDirty=true}
function rowOf(e){const q=e.target.closest?e.target.closest('#vt tbody tr'):null;return q?q.dataset.id:null}
$('vmain').addEventListener('pointerdown',e=>{const id=rowOf(e);if(!id||e.button!==0)return;e.preventDefault();detailId=id;
 if(!byId[id].file){paintRows();renderDetail();return}
 if(e.shiftKey&&anchorId){setSel(rangeIds(anchorId,id),anchorId);paintRows();renderDetail();applySel();return}
 if(e.ctrlKey||e.metaKey){if(SEL.includes(id)){if(SEL.length>1)setSel(SEL.filter(x=>x!==id))}else setSel(SEL.concat([id]));anchorId=id;paintRows();renderDetail();applySel();return}
 anchorId=id;dragSel=id;setSel([id]);paintRows();renderDetail()});
$('vmain').addEventListener('pointermove',e=>{if(dragSel===null||!(e.buttons&1))return;const q=document.elementFromPoint(e.clientX,e.clientY),tr=q&&q.closest?q.closest('#vt tbody tr'):null;if(!tr)return;
 const want=rangeIds(dragSel,tr.dataset.id).filter(id=>byId[id].file);if(want.length&&want.slice().sort().join()!==SEL.slice().sort().join()){setSel(want,dragSel);detailId=tr.dataset.id;paintRows()}});
addEventListener('pointerup',()=>{if(dragSel!==null){dragSel=null;applySel()}});
function renderDetail(){const box=$('vside'),v=byId[detailId];if(!v){box.innerHTML='<h3>Version details</h3><p class="note">Select a version in the table.</p>';return}const sm=simple(),on=SEL.includes(v.id),ref=SEL[0]===v.id;
 let h='<h3>Version details</h3><h2>'+v.id+'</h2><div class="sub">'+esc(sm&&v.st?v.st:v.title)+'</div>'+
  '<div class="acts"><button class="prim" id="dv" '+(v.file?'':'disabled')+'>View on track</button><button id="dc" '+(v.file&&!(on&&SEL.length===1)?'':'disabled')+'>'+(on?'Remove from comparison':'Add to comparison')+'</button>'+
  (on&&!ref?'<button id="dr">Put in focus</button>':'')+'<button id="dt" '+(v.file?'':'disabled')+'>Telemetry</button></div>'+
  (v.file?'':'<p class="note">No lap was recorded for this version.</p>')+
  '<div class="kv"><span>Lap time</span><b class="num">'+fmtLap(v.lap)+(v.lap&&!sm?'  ('+v.lap.toFixed(2)+' s)':'')+'</b><span>Result</span><b>'+status(v)+'</b>'+
  (v.dbest!=null?'<span>'+(sm?'Against the best before it':'vs best so far ('+fmtLap(v.bestBefore)+')')+'</span><b class="num">'+deltaTxt(v.dbest)+'</b>':'')+
  (!sm&&v.delta!=null?'<span>vs '+v.base+' (last kept)</span><b class="num">'+sgn(v.delta,2)+' s</b>':'')+
  (v.top?'<span>Top speed</span><b class="num">'+v.top+' km/h</b>':'')+(v.slow?'<span>Slowest corner</span><b class="num">'+v.slow+' km/h</b>':'')+(v.damage?'<span>Damage</span><b class="num">'+esc(v.damage)+'</b>':'')+
  (!sm&&v.sum?'<span>Closest to the edge</span><b class="num">'+v.sum.maxtp.toFixed(3)+' at '+v.sum.maxtp_at+' m</b><span>Braking</span><b class="num">'+v.sum.brake+' % of the lap</b><span>Full throttle</span><b class="num">'+v.sum.full+' % of the lap</b>':'')+'</div>';
 if(!sm&&v.st)h+='<h3>In plain words</h3><p>'+esc(v.st)+'</p>';
 if(v.what)h+='<h3>What changed</h3><p>'+esc(v.what)+'</p>';if(v.why)h+='<h3>Why</h3><p>'+esc(v.why)+'</p>';
 if(v.decision)h+='<h3>Decision</h3><p>'+esc(v.decision)+'</p>';if(v.learned)h+='<h3>What was learned</h3><p>'+esc(v.learned)+'</p>';
 if(!sm)h+='<p class="note">Texts from CHANGELOG-simple.md; the technical record is in CHANGELOG.md.</p>';
 box.innerHTML=h;box.scrollTop=0;
 $('dv').onclick=()=>{const f=()=>{go(0);setPlaying(true);showTab('pm')};on?makeRef(v.id,f):only(v.id,f)};$('dc').onclick=()=>toggleSel(v.id);
 if($('dr'))$('dr').onclick=()=>makeRef(v.id);$('dt').onclick=()=>{const f=()=>showTab('pt');on?makeRef(v.id,f):only(v.id,f)}}
/* progress chart */
let pr=[-0.5,LV.length-0.5],progHover=-1;
function setupProg(){const cv=$('prog');if(!cv)return;progDirty=true;let dn=null,moved=false;const L=52,Rr=10;
 const at=e=>{const r=cv.getBoundingClientRect();return pr[0]+(e.clientX-r.left-L)/(r.width-L-Rr)*(pr[1]-pr[0])};
 cv.addEventListener('wheel',e=>{e.preventDefault();const d=at(e),k=Math.exp(e.deltaY*0.0015);let a=d-(d-pr[0])*k,b=d+(pr[1]-d)*k;if(b-a<4)return;pr=[Math.max(-0.5,a),Math.min(LV.length-0.5,b)];progDirty=true},{passive:false});
 cv.addEventListener('pointerdown',e=>{dn=e.clientX;moved=false;cv.setPointerCapture(e.pointerId)});
 cv.addEventListener('pointermove',e=>{const r=cv.getBoundingClientRect();if(dn!==null){const dx=e.clientX-dn;if(Math.abs(dx)>3)moved=true;if(moved){let sh=-dx/(r.width-L-Rr)*(pr[1]-pr[0]);sh=Math.max(-0.5-pr[0],Math.min(LV.length-0.5-pr[1],sh));pr=[pr[0]+sh,pr[1]+sh];dn=e.clientX}}
  const k=Math.round(at(e));progHover=(k>=0&&k<LV.length)?k:-1;progDirty=true;const T=$('tip');if(progHover<0){T.style.display='none';return}const v=LV[progHover];
  T.innerHTML='<b style="color:var(--ink)">'+v.id+'</b> &nbsp; <span class="num">'+fmtLap(v.lap)+'</span><br>'+CLS[v.cls][2]+(v.dbest!=null?'<br><span class="num">'+(simple()?Math.abs(v.dbest).toFixed(2)+' s '+(v.dbest<0?'faster':v.dbest>0?'slower':'(the same)')+' than the best lap before it':sgn(v.dbest,2)+' s vs the best kept lap before it ('+fmtLap(v.bestBefore)+')')+'</span>':'')+
   '<br><span class="note">'+esc(simple()&&v.st?v.st:v.title).slice(0,110)+'</span>';T.style.display='block';
  T.style.left=Math.min(innerWidth-T.offsetWidth-8,e.clientX+14)+'px';T.style.top=(e.clientY+16)+'px'});
 cv.addEventListener('pointerup',()=>{if(!moved&&progHover>=0){detailId=LV[progHover].id;renderVersions()}dn=null});
 cv.addEventListener('pointerleave',()=>{progHover=-1;$('tip').style.display='none';progDirty=true});cv.addEventListener('dblclick',()=>{pr=[-0.5,LV.length-0.5];progDirty=true})}
function niceTicks(lo,hi,n){const raw=(hi-lo)/n,p=Math.pow(10,Math.floor(Math.log10(raw))),st=[1,2,2.5,5,10].map(m=>m*p).find(m=>m>=raw*0.999)||raw,o=[];for(let v=Math.ceil(lo/st-1e-9)*st;v<=hi+1e-9;v+=st)o.push(Math.abs(v)<1e-9?0:v);return [o,st]}
function drawProg(){const cv=$('prog');if(!cv||!progDirty)return;const r=dpr(),W=cv.clientWidth,H=cv.clientHeight;if(!W)return;progDirty=false;cv.width=W*r;cv.height=H*r;const x=cv.getContext('2d');x.setTransform(r,0,0,r,0,0);
 const L=52,Rr=10,T=10,Bm=20,pw=W-L-Rr,ph=H-T-Bm,X=k=>L+(k-pr[0])/(pr[1]-pr[0])*pw;let lo=1e9,hi=0;
 LV.forEach((v,k)=>{if(k>=pr[0]&&k<=pr[1]){lo=Math.min(lo,v.lap);hi=Math.max(hi,v.lap)}});const pad=(hi-lo)*0.1||0.5;lo-=pad;hi+=pad;const Y=v=>T+(1-(v-lo)/(hi-lo))*ph;
 x.font='11px "Segoe UI",system-ui';x.fillStyle='#85847b';x.strokeStyle='#2a2a27';x.lineWidth=1;x.textAlign='right';x.textBaseline='middle';
 for(const v of niceTicks(lo,hi,4)[0]){x.beginPath();x.moveTo(L,Y(v));x.lineTo(W-Rr,Y(v));x.stroke();x.fillText(fmtLap(v),L-6,Y(v))}
 x.textAlign='center';x.textBaseline='top';const stp=Math.max(1,Math.ceil((pr[1]-pr[0])/14));for(let k=Math.ceil(pr[0]);k<=pr[1];k++){if(k%stp===0&&LV[k])x.fillText(LV[k].id,X(k),T+ph+5)}
 x.save();x.beginPath();x.rect(L-8,T-8,pw+16,ph+16);x.clip();
 /* best lap so far, as a step line */
 x.strokeStyle='#bdbcb2';x.lineWidth=1.5;x.beginPath();let pen=false;LV.forEach((v,k)=>{if(v.bestAfter==null)return;const y=Y(v.bestAfter);if(!pen){x.moveTo(X(k),y);pen=true}else{x.lineTo(X(k),y)}x.lineTo(X(k+1),y)});x.stroke();
 LV.forEach((v,k)=>{const px=X(k),py=Y(v.lap),q=CLS[v.cls];x.beginPath();x.arc(px,py,4,0,7);if(q[1]){x.fillStyle=q[0];x.fill();x.strokeStyle='#161615';x.lineWidth=1.5;x.stroke()}else{x.fillStyle='#161615';x.fill();x.strokeStyle=q[0];x.lineWidth=2;x.stroke()}
  if(SEL.includes(v.id)){x.beginPath();x.arc(px,py,8,0,7);x.strokeStyle=SELC[v.id];x.lineWidth=2;x.stroke()}
  if(v.id===detailId||k===progHover){x.beginPath();x.arc(px,py,11,0,7);x.strokeStyle=v.id===detailId?'#fff':'#bdbcb2';x.lineWidth=1;x.stroke()}});x.restore()}

/* ---------- telemetry tab ---------- */
const CH=[{k:'v',ti:'Speed',u:'km/h',cap:'How fast the car is going. The dips are the corners.',adv:'Grey: the speed the plan allows (reference run).',al:true,s:1},
 {k:'th',ti:'Throttle',u:'0 to 1',cap:'How far the accelerator is pressed. 1 is flat out.',s:1},{k:'br',ti:'Brake',u:'0 to 1',cap:'How hard the brake is pressed.',s:1},
 {k:'st',ti:'Steering',u:'+1 = full left'},{k:'tp',ti:'Track position',u:'+1 = left edge, -1 = right edge',fixed:[-1,1]},{k:'g',ti:'Gear',u:'',step:true},
 {k:'gap',ti:'Time gap',u:'seconds',cap:'Above zero a compared car is behind the reference car; below zero it is ahead.',adv:'Compared run minus reference run, at the same distance.',gap:true,s:1}];
let xr=[-12,TOTAL],gapS=null;
function buildGap(){gapS=null;if(!CM.length)return;gapS=[];for(const m of CM)m.gap=[];for(let d=0;d<=TOTAL-8;d+=5){gapS.push(d);const ta=R.t[idxAtD(R,d)];for(const m of CM)m.gap.push(m.r.t[idxAtD(m.r,d)]-ta)}}
const sw=col=>'<span class="sw" style="background:'+col+'"></span>';
function buildTelemetry(){const box=$('pt'),sm=simple(),rs=[{r:R,col:SELC[SEL[0]],id:SEL[0]}].concat(CM);
 let h='<h3>Summary</h3><table style="width:auto;margin-bottom:16px"><tr><th class="l"></th>'+rs.map((m,k)=>'<th style="text-transform:none;color:var(--ink)">'+sw(m.col)+m.id+(k===0&&rs.length>1?' <span class="note">reference</span>':'')+'</th>').join('')+'</tr>';
 const rowsS=[['Lap time',r=>fmtLap(r.sum.lap)+(sm?'':'  ('+r.sum.lap.toFixed(3)+' s)')],['Top speed',r=>r.sum.top.toFixed(0)+' km/h'],['Slowest corner',r=>r.sum.slow.toFixed(0)+' km/h'],
  [sm?'Closest to the road edge (1 = on the edge)':'Max |trackPos|',r=>r.sum.maxtp.toFixed(sm?2:3)+' at '+r.sum.maxtp_at+' m'],['Damage',r=>r.sum.damage.toFixed(0)],[sm?'Part of the lap spent braking':'Braking',r=>r.sum.brake+' %'],[sm?'Part of the lap at full throttle':'Full throttle',r=>r.sum.full+' %']];
 for(const q of rowsS)h+='<tr><td class="l">'+q[0]+'</td>'+rs.map(m=>'<td class="num" style="color:var(--ink)">'+q[1](m.r)+'</td>').join('')+'</tr>';
 if(CM.length)h+='<tr><td class="l">'+(sm?'Against the reference':'Lap vs reference')+'</td><td></td>'+CM.map(m=>{const df=m.r.sum.lap-R.sum.lap;return '<td class="num '+(df<0?'neg':df>0?'posd':'')+'">'+(sm?Math.abs(df).toFixed(3)+' s '+(df>0?'slower':'faster'):sgn(df,3)+' s')+'</td>'}).join('')+'</tr>';
 h+='</table><h3>'+(sm?'Along the lap':'Channels by distance')+'</h3><div class="note" style="margin-bottom:8px">'+(sm?'The charts run from the start line on the left to the finish on the right. The white line marks where the car is now; click anywhere on a chart to move the car there.':'Wheel: zoom distance. Drag: pan. Click: seek. Double-click: full lap.')+
  ' &nbsp; '+rs.map(m=>sw(m.col)+m.id).join(' &nbsp; ')+'</div>';
 for(const q of CH){if((q.gap&&!CM.length)||(sm&&!q.s))continue;h+='<div class="chart"><div class="ti">'+q.ti+(q.u?' <span class="note">'+q.u+'</span>':'')+'</div>'+((sm?q.cap:q.adv)?'<div class="cap">'+(sm?q.cap:q.adv)+'</div>':'')+'<canvas data-k="'+q.k+'"></canvas></div>'}
 if(!sm){h+='<h3>Sections of 100 m</h3><div class="note" style="margin-bottom:6px">Times are for the reference run; the columns for compared runs show their difference to it. Click a row to seek.</div><table id="sect" style="width:auto"><tr><th class="l">From</th><th>Time</th>'+CM.map(m=>'<th style="text-transform:none">'+sw(m.col)+m.id+'</th>').join('')+'<th>Min speed</th><th>Max speed</th><th>Max brake</th><th>Max |trackPos|</th></tr>';
  for(let m=0;m<TOTAL-50;m+=100){const e=Math.min(m+100,TOTAL-8),a0=idxAtD(R,m),a1=idxAtD(R,e);if(a1<=a0)continue;let lo=1e9,hi=0,bm=0,tm=0;for(let k=a0;k<=a1;k++){lo=Math.min(lo,R.v[k]);hi=Math.max(hi,R.v[k]);bm=Math.max(bm,R.br[k]);tm=Math.max(tm,Math.abs(R.tp[k]))}
   const ta=R.t[a1]-R.t[a0];let cmp='';for(const q of CM){const df=q.r.t[idxAtD(q.r,e)]-q.r.t[idxAtD(q.r,m)]-ta;cmp+='<td class="num '+(df<-0.005?'neg':df>0.005?'posd':'')+'">'+sgn(df,2)+'</td>'}
   h+='<tr data-m="'+m+'" style="cursor:pointer"><td class="l num">'+m+' m</td><td class="num">'+ta.toFixed(2)+'</td>'+cmp+'<td class="num">'+lo.toFixed(0)+'</td><td class="num">'+hi.toFixed(0)+'</td><td class="num">'+bm.toFixed(2)+'</td><td class="num">'+tm.toFixed(2)+'</td></tr>'}h+='</table>'}
 box.innerHTML=h+'<div style="height:24px"></div>';
 box.querySelectorAll('#sect tr[data-m]').forEach(tr=>tr.onclick=()=>{setPlaying(false);go(idxAtD(R,+tr.dataset.m))});
 box.querySelectorAll('canvas').forEach(cv=>{let dn=null,moved=false;
  cv.addEventListener('wheel',e=>{e.preventDefault();const r=cv.getBoundingClientRect(),f=(e.clientX-r.left-46)/(r.width-56),d=xr[0]+f*(xr[1]-xr[0]),k=Math.exp(e.deltaY*0.0015);let a=d-(d-xr[0])*k,b=d+(xr[1]-d)*k;if(b-a<20)return;xr=[Math.max(-12,a),Math.min(TOTAL,b)];chartsDirty=true},{passive:false});
  cv.addEventListener('pointerdown',e=>{dn=e.clientX;moved=false;cv.setPointerCapture(e.pointerId)});
  cv.addEventListener('pointermove',e=>{const r=cv.getBoundingClientRect();if(dn!==null){const dx=e.clientX-dn;if(Math.abs(dx)>3)moved=true;if(moved){const w=xr[1]-xr[0];let sh=-dx/(r.width-56)*w;sh=Math.max(-12-xr[0],Math.min(TOTAL-xr[1],sh));xr=[xr[0]+sh,xr[1]+sh];dn=e.clientX}}
   hoverD=xr[0]+(e.clientX-r.left-46)/(r.width-56)*(xr[1]-xr[0]);tip(e);chartsDirty=true});
  cv.addEventListener('pointerup',()=>{if(!moved&&hoverD!==null){setPlaying(false);go(idxAtD(R,hoverD))}dn=null});
  cv.addEventListener('pointerleave',()=>{hoverD=null;$('tip').style.display='none';chartsDirty=true});cv.addEventListener('dblclick',()=>{xr=[-12,TOTAL];chartsDirty=true})});chartsDirty=true}
function tip(e){const T=$('tip');if(hoverD===null||hoverD<xr[0]||hoverD>xr[1]){T.style.display='none';return}const sm=simple(),rs=[{r:R,col:SELC[SEL[0]],id:SEL[0]}].concat(CM);
 const row=(n,f)=>'<tr><td style="text-align:left">'+n+'</td>'+rs.map(m=>'<td class="num">'+f(m.r,idxAtD(m.r,hoverD))+'</td>').join('')+'</tr>';
 T.innerHTML='<table><tr><th style="text-align:left">'+hoverD.toFixed(0)+' m</th>'+rs.map(m=>'<th style="text-transform:none">'+sw(m.col)+m.id+'</th>').join('')+'</tr>'+
  row('Lap time',(r,k)=>r.t[k].toFixed(2)+' s')+row('Speed',(r,k)=>r.v[k].toFixed(0)+' km/h')+row('Throttle',(r,k)=>r.th[k].toFixed(2))+row('Brake',(r,k)=>r.br[k].toFixed(2))+
  (sm?'':row('Plan allows',(r,k)=>r.al[k]>350||!r.al[k]?'no limit':r.al[k].toFixed(0))+row('Steering',(r,k)=>r.st[k].toFixed(2))+row('Track position',(r,k)=>r.tp[k].toFixed(2))+row('Gear',(r,k)=>r.g[k]))+'</table>';
 T.style.display='block';T.style.left=Math.min(innerWidth-T.offsetWidth-8,e.clientX+14)+'px';T.style.top=Math.max(48,e.clientY-T.offsetHeight-10)+'px'}
let lastCur=-1;
function drawCharts(){if(!chartsDirty&&lastCur===i)return;chartsDirty=false;lastCur=i;const r=dpr();
 document.querySelectorAll('#pt canvas').forEach(cv=>{const W=cv.clientWidth,H=cv.clientHeight;if(!W)return;if(cv.width!==Math.round(W*r)){cv.width=Math.round(W*r);cv.height=Math.round(H*r)}
  const q=CH.find(z=>z.k===cv.dataset.k),x=cv.getContext('2d');x.setTransform(r,0,0,r,0,0);x.clearRect(0,0,W,H);
  const L=46,Rr=10,T=6,Bm=18,pw=W-L-Rr,ph=H-T-Bm,X=d=>L+(d-xr[0])/(xr[1]-xr[0])*pw;let lo=1e9,hi=-1e9;const series=[];
  if(q.gap){if(!gapS)return;for(const m of CM)series.push({s:gapS,v:m.gap,col:m.col,w:1.8})}else{series.push({s:R.d,v:R[q.k],col:SELC[SEL[0]],w:2});for(const m of CM)series.push({s:m.r.d,v:m.r[q.k],col:m.col,w:1.5})}
  for(const se of series){const k0=bsearch(se.s,xr[0]),k1=bsearch(se.s,xr[1]);for(let k=k0;k<=k1;k++){const v=se.v[k];if(v<lo)lo=v;if(v>hi)hi=v}}
  if(q.fixed){lo=q.fixed[0];hi=q.fixed[1]}else if(q.gap){const m=Math.max(Math.abs(lo),Math.abs(hi),0.05)*1.1;lo=-m;hi=m}else if(q.k==='th'||q.k==='br'){lo=0;hi=1}else if(q.k==='g'){lo=0;hi=6.4}
  else if(q.k==='st'){const m=Math.max(Math.abs(lo),Math.abs(hi),0.1)*1.08;lo=-m;hi=m}else{lo=0;hi=Math.ceil(hi*1.04/50)*50}
  const Y=v=>T+(1-(v-lo)/(hi-lo))*ph;x.font='11px "Segoe UI",system-ui';x.fillStyle='#85847b';x.strokeStyle='#2a2a27';x.lineWidth=1;x.textAlign='right';x.textBaseline='middle';
  const tk=niceTicks(lo,hi,4),dec=tk[1]>=1?0:(Math.abs(tk[1]*10-Math.round(tk[1]*10))<1e-9?1:2);for(const v of tk[0]){const y=Y(v);x.beginPath();x.moveTo(L,y);x.lineTo(W-Rr,y);x.stroke();x.fillText(v.toFixed(dec),L-6,y)}
  x.textAlign='center';x.textBaseline='top';const span=xr[1]-xr[0],stp=[10,20,50,100,200,500,1000].find(s=>span/s<=12)||1000;
  for(let d=Math.ceil(xr[0]/stp)*stp;d<=xr[1];d+=stp){const xx=X(d);x.beginPath();x.moveTo(xx,T);x.lineTo(xx,T+ph);x.stroke();x.fillText(d+' m',xx,T+ph+4)}
  if(lo<0&&hi>0){x.strokeStyle='#55554f';x.beginPath();x.moveTo(L,Y(0));x.lineTo(W-Rr,Y(0));x.stroke()}
  x.save();x.beginPath();x.rect(L,T,pw,ph);x.clip();
  if(q.al&&!simple()){x.strokeStyle='#85847b';x.lineWidth=1;x.beginPath();const k0=bsearch(R.d,xr[0]),k1=Math.min(R.d.length-1,bsearch(R.d,xr[1])+1);let pen=false;for(let k=k0;k<=k1;k++){if(!R.al[k]){pen=false;continue}const yy=Y(Math.min(R.al[k],hi*1.5));pen?x.lineTo(X(R.d[k]),yy):x.moveTo(X(R.d[k]),yy);pen=true}x.stroke()}
  for(let n=series.length-1;n>=0;n--){const se=series[n];x.strokeStyle=se.col;x.lineWidth=se.w;x.lineJoin='round';x.beginPath();const k0=bsearch(se.s,xr[0]),k1=Math.min(se.s.length-1,bsearch(se.s,xr[1])+1);
   for(let k=k0;k<=k1;k++){const xx=X(se.s[k]),yy=Y(se.v[k]);if(k===k0)x.moveTo(xx,yy);else{if(q.step)x.lineTo(xx,Y(se.v[k-1]));x.lineTo(xx,yy)}}x.stroke()}
  const cx=X(R.d[i]);x.strokeStyle='#fff';x.lineWidth=1;x.beginPath();x.moveTo(cx,T);x.lineTo(cx,T+ph);x.stroke();
  if(hoverD!==null){const hx=X(hoverD);x.strokeStyle='#bdbcb2';x.setLineDash([3,3]);x.beginPath();x.moveTo(hx,T);x.lineTo(hx,T+ph);x.stroke();x.setLineDash([]);
   for(const se of series){const k=bsearch(se.s,hoverD);x.beginPath();x.arc(X(se.s[k]),Y(se.v[k]),4,0,7);x.fillStyle=se.col;x.fill();x.strokeStyle='#161615';x.lineWidth=2;x.stroke()}}x.restore()})}

/* ---------- tabs, mode, start ---------- */
function showTab(id){tab=id;document.querySelectorAll('.tab').forEach(q=>q.classList.toggle('on',q.dataset.t===id));document.querySelectorAll('.page').forEach(p=>p.classList.toggle('on',p.id===id));
 $('bar').classList.toggle('on',id!=='pv');$('tip').style.display='none';chartsDirty=true;progDirty=true;if(id==='pm')size()}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>showTab(b.dataset.t));
function setMode(m){mode=m;try{localStorage.setItem('rv_mode',m)}catch(e){}document.querySelectorAll('#mode button').forEach(b=>b.classList.toggle('on',b.dataset.m===m));
 if(m==='simple')LY.centre.on=false;renderVersions();if(R){legend();buildSide();buildTelemetry()}}
document.querySelectorAll('#mode button').forEach(b=>b.onclick=()=>setMode(b.dataset.m));
/* optional start state from the address, e.g. index.html#tab=pm&run=v1.05&cmp=v1.01,v0.96&frame=1539&mode=adv&list=gain */
const H={};location.hash.slice(1).split('&').forEach(q=>{const p=q.split('=');if(p[0])H[p[0]]=p[1]===undefined?true:decodeURIComponent(p[1])});
if(H.mode)mode=H.mode;if(H.list)listMode=H.list;if(H.all)view.all=true;if(H.fixed)view.rot=false;if(H.zoom)view.z=+H.zoom;
const firstId=(H.run&&byId[H.run]&&byId[H.run].file)?H.run:V.filter(v=>v.file&&!v.extra).slice(-1)[0].id;detailId=H.detail||firstId;
addSel(firstId);if(H.cmp)String(H.cmp).split(',').forEach(x=>{if(byId[x])addSel(x)});
setMode(mode);size();
applySel(()=>{if(H.frame){setPlaying(false);go(+H.frame-1)}if(H.pause)setPlaying(false)});
if(H.tab)showTab(H.tab);
requestAnimationFrame(tick);
