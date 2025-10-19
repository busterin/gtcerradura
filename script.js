// --- Helpers
const $ = sel => document.querySelector(sel);
const svg = document.getElementById('svg');

function makeSVG(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}
function dist(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return Math.hypot(dx, dy); }

// --- Audio (sin archivos)
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let actx;
function ensureAudio(){ actx ||= new AudioCtx(); }
function beep(freq=440, dur=0.08, type='square', gain=0.04){
  try{
    ensureAudio();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type=type; o.frequency.value=freq;
    g.gain.value=gain;
    o.connect(g); g.connect(actx.destination);
    o.start();
    setTimeout(()=>o.stop(), dur*1000);
  }catch(_){/* iOS sin gesto: ignorar */}
}
function chime(){ beep(740,0.06,'sine',0.05); setTimeout(()=>beep(880,0.08,'sine',0.05),70); setTimeout(()=>beep(1175,0.12,'sine',0.04),160); }

// --- Gradientes y defs
const defs = makeSVG('defs');
const brassGrad = makeSVG('linearGradient', {id:'brassGrad', x1:'0%',y1:'0%',x2:'0%',y2:'100%'});
brassGrad.append(makeSVG('stop',{offset:'0%','stop-color':'#cbb36b'}));
brassGrad.append(makeSVG('stop',{offset:'100%','stop-color':'#6f5d29'}));
const gearGrad = makeSVG('linearGradient', {id:'gearGrad', x1:'0%',y1:'0%',x2:'0%',y2:'100%'});
gearGrad.append(makeSVG('stop',{offset:'0%','stop-color':'#6c4a2c'}));
gearGrad.append(makeSVG('stop',{offset:'100%','stop-color':'#3b2a1a'}));
defs.append(brassGrad, gearGrad);
svg.append(defs);

// --- Plano base
svg.append(makeSVG('rect', {x:10,y:10,width:1180,height:640,rx:16, fill:'#241b16', stroke:'#0b0806', 'stroke-width':3}));

// --- Plazas y ejes
const pegs = [
  {id:'pegA', x: 250, y: 330, r: 56},
  {id:'pegB', x: 500, y: 210, r: 46},
  {id:'pegC', x: 500, y: 460, r: 46},
];
const inputShaft  = {id:'input',  x:  90, y:330, r:50};
const outputShaft = {id:'output', x:1020, y:330, r:50};

function drawPeg(peg){
  const g = makeSVG('g', {class:'pegGroup', 'data-id':peg.id});
  const ring = makeSVG('circle', {cx:peg.x, cy:peg.y, r:peg.r+12, class:'peg ring', opacity:.92});
  const hole = makeSVG('circle', {cx:peg.x, cy:peg.y, r:14, class:'peg'});
  g.append(ring, hole);
  svg.append(g);
  peg.el = g; peg.ring = ring;
}
pegs.forEach(drawPeg);

function drawShaft(s){
  const g = makeSVG('g');
  g.append(
    makeSVG('circle', {cx:s.x, cy:s.y, r:s.r+16, class:'peg ring'}),
    makeSVG('circle', {cx:s.x, cy:s.y, r:16, class:'peg'})
  );
  svg.append(g);
}
drawShaft(inputShaft); drawShaft(outputShaft);

// --- Engranajes
const gears = [];
function createGear({id,x,y,R, fixed=false, draggable=false}){
  const g = makeSVG('g', {class:'gear'+(draggable?' draggable':''), 'data-id':id, transform:`translate(${x},${y}) rotate(0)`});
  g.append(
    ...[0,1,2,3].map(i=>{
      const ang=i*Math.PI/2, x1=Math.cos(ang)*12, y1=Math.sin(ang)*12, x2=Math.cos(ang)*(R-18), y2=Math.sin(ang)*(R-18);
      return makeSVG('line',{x1,y1,x2,y2,class:'spoke'});
    }),
    makeSVG('circle',{class:'rim', cx:0, cy:0, r:R-6}),
    makeSVG('circle',{class:'teeth', cx:0, cy:0, r:R-1, fill:'none'}),
    makeSVG('circle',{class:'hub', cx:0, cy:0, r:12}),
    makeSVG('circle',{cx:0, cy:-(R-10), r:4, fill:'#ffd089', opacity:.8})
  );
  svg.append(g);
  const obj={id,x,y,R,el:g,fixed,draggable,angle:0,placedOn:null,isInput:false,isOutput:false};
  gears.push(obj); return obj;
}

// Fase 1
const gearInput  = createGear({id:'gInput',  x:inputShaft.x,  y:inputShaft.y,  R:inputShaft.r, fixed:true});
const gearOutput = createGear({id:'gOutput', x:outputShaft.x, y:outputShaft.y, R:outputShaft.r, fixed:true});
gearInput.isInput = true; gearOutput.isOutput = true;
const gearL = createGear({id:'gL', x:360, y:560, R:56, draggable:true});
const gearS = createGear({id:'gS', x:690, y:560, R:46, draggable:true});

// Fase 2: marcas y aguja
const marks = makeSVG('g', {class:'marks'}); svg.append(marks);
const markR = gearOutput.R + 28;
for(let i=0;i<3;i++){
  const a = i*120*Math.PI/180;
  marks.append(makeSVG('circle',{cx: outputShaft.x + Math.cos(a)*markR, cy: outputShaft.y + Math.sin(a)*markR, r:6, fill:'#ffd089'}));
}
marks.style.display='none';
const needle = makeSVG('line',{class:'needle', x1:outputShaft.x, y1:outputShaft.y, x2:outputShaft.x, y2:outputShaft.y-(gearOutput.R+18)});
svg.append(needle); needle.style.display='none';

// --- Drag robusto
let drag=null;
function gearFromTarget(t){
  while(t && t!==svg){
    if(t.classList && t.classList.contains('gear')) return gears.find(g=>g.el===t);
    t = t.parentNode;
  }
  return null;
}
svg.addEventListener('pointerdown', e=>{
  const obj = gearFromTarget(e.target);
  if(!obj || !obj.draggable) return;
  drag = {obj, startX:e.clientX, startY:e.clientY, baseX:obj.x, baseY:obj.y};
  obj.el.setPointerCapture?.(e.pointerId);
});
svg.addEventListener('pointermove', e=>{
  if(!drag) return;
  const dx = (e.clientX - drag.startX), dy = (e.clientY - drag.startY);
  drag.obj.x = drag.baseX + dx * (1200 / svg.clientWidth);
  drag.obj.y = drag.baseY + dy * (660 / svg.clientHeight);
  updateTransform(drag.obj);
});
svg.addEventListener('pointerup', ()=>{
  if(!drag) return;
  const obj=drag.obj;
  let snapped=false;
  for(const p of pegs){
    const d=dist({x:obj.x,y:obj.y}, p);
    if(d<50){ obj.x=p.x; obj.y=p.y; obj.placedOn=p.id; snapped=true; p.ring.classList.add('pegGlow'); beep(600); break; }
  }
  if(!snapped) obj.placedOn=null;
  updateTransform(obj);
  drag=null;
  checkPhase1();
});

function updateTransform(obj){ obj.el.setAttribute('transform', `translate(${obj.x},${obj.y}) rotate(${obj.angle})`); }

// --- Rotación y transmisión
function rotateGear(gear, delta){ gear.angle=(gear.angle+delta)%360; updateTransform(gear); }
function transmitRotation(){
  const tol=2, pairs=[];
  for(let i=0;i<gears.length;i++){
    for(let j=i+1;j<gears.length;j++){
      const A=gears[i], B=gears[j], d=dist(A,B);
      if(Math.abs(d-(A.R+B.R))<=tol) pairs.push([A,B]);
    }
  }
  const visited=new Set(), q=[{g:gearInput,w:1}], derived=new Map([[gearInput,0]]);
  while(q.length){
    const {g,w}=q.shift(); visited.add(g);
    for(const [A,B] of pairs){
      let curr=null, other=null;
      if(A===g){curr=A; other=B;} else if(B===g){curr=B; other=A;} else continue;
      if(visited.has(other)) continue;
      const ratio = -(curr.R/other.R);
      q.push({g:other, w:w*ratio});
      const inAngle = gearInput.angle;
      derived.set(other, (inAngle*w*ratio)%360);
    }
  }
  for(const g of gears){ if(g!==gearInput && derived.has(g)){ g.angle=derived.get(g); updateTransform(g);} }
  return pairs;
}

// --- Fase 1: validación
function checkPhase1(){
  const pairs = transmitRotation();
  const connected = (a,b)=>pairs.some(([A,B])=>(A===a&&B===b)||(A===b&&B===a));
  const ok =
    ((gearL.placedOn && gearS.placedOn) && connected(gearInput,gearL) && connected(gearL,gearS) && connected(gearS,gearOutput))
 || ((gearL.placedOn && gearS.placedOn) && connected(gearInput,gearS) && connected(gearS,gearL) && connected(gearL,gearOutput));
  if(ok){
    $('#statusText').textContent='¡Tren correcto!'; $('#statusText').className='status ok';
    gearOutput.el.classList.add('targetGlow'); chime();
    setTimeout(()=>goPhase2(),700);
  }else{
    $('#statusText').textContent='Pendiente'; $('#statusText').className='status wip';
    gearOutput.el.classList.remove('targetGlow');
  }
}

// --- Fase 2
let inPhase=1;
function goPhase2(){
  inPhase=2;
  gearL.draggable=false; gearL.el.classList.remove('draggable');
  gearS.draggable=false; gearS.el.classList.remove('draggable');
  $('#phaseLabel').textContent='FASE 2 · Sincronía';
  $('#hintBox').innerHTML='<strong>Objetivo:</strong> Gira el <em>eje de entrada</em> para alinear el puntero de salida con los 3 puntos de referencia. Debe apuntar exactamente a uno de ellos.';
  marks.style.display='block'; needle.style.display='block';
  overlay('¡Fase 2!','Haz girar la manivela (botón o arrastrando sobre la entrada). Alinea el puntero de la salida con uno de los puntos.');
}

// Botón giro
$('#btnRotate').addEventListener('click', ()=>{
  rotateGear(gearInput,18); transmitRotation(); checkPhase2();
});

// Giro por arrastre en entrada
let spinDrag=null;
svg.addEventListener('pointerdown', e=>{
  if(inPhase<2) return;
  const p = svgPoint(e);
  if(dist(p,inputShaft) < gearInput.R+30){
    spinDrag = {startAngle: Math.atan2(p.y-inputShaft.y, p.x-inputShaft.x)};
  }
});
svg.addEventListener('pointermove', e=>{
  if(!spinDrag) return;
  const p = svgPoint(e);
  const ang = Math.atan2(p.y-inputShaft.y, p.x-inputShaft.x);
  const delta = (ang - spinDrag.startAngle) * 180/Math.PI;
  rotateGear(gearInput, delta);
  spinDrag.startAngle = ang;
  transmitRotation(); checkPhase2();
});
svg.addEventListener('pointerup', ()=>{ spinDrag=null; });

function svgPoint(evt){
  const pt = svg.createSVGPoint(); pt.x=evt.clientX; pt.y=evt.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

function checkPhase2(){
  const angle = (gearOutput.angle - 90) % 360;
  const norm = ((angle + 540) % 360) - 180;
  const targets = [0,120,-120];
  let ok=false;
  for(const t of targets){
    const diff = Math.abs(((norm - t + 540) % 360) - 180);
    if(diff < 4){ ok=true; break; }
  }
  const rad = (gearOutput.angle*Math.PI/180) - Math.PI/2;
  needle.setAttribute('x2', outputShaft.x + Math.cos(rad)*(gearOutput.R+18));
  needle.setAttribute('y2', outputShaft.y + Math.sin(rad)*(gearOutput.R+18));
  if(ok){
    $('#statusText').textContent='¡Cerradura abierta!'; $('#statusText').className='status ok';
    gearOutput.el.classList.add('targetGlow'); chime();
    overlay('¡Bien hecho!','Has abierto la cerradura. ¿Añadimos vapor y “clic” metálico final?');
  }else{
    $('#statusText').textContent='Alinea el puntero'; $('#statusText').className='status wip';
    gearOutput.el.classList.remove('targetGlow');
  }
}

// --- Overlay / ayuda
function overlay(title,msg){
  $('#overlayTitle').textContent=title;
  $('#overlayMsg').textContent=msg;
  $('#overlay').classList.add('show');
}
$('#btnOverlay').addEventListener('click', ()=>$('#overlay').classList.remove('show'));
$('#btnHow').addEventListener('click', ()=>overlay('Cómo se juega',
  inPhase===1
    ? 'Fase 1: arrastra los 2 engranajes a las plazas para crear un tren desde el eje de entrada (izquierda) hasta la salida (derecha). Deben tocarse sin solaparse.'
    : 'Fase 2: gira el eje de entrada (botón o arrastrando cerca del engranaje izquierdo) para alinear el puntero de salida con uno de los tres puntos luminosos.'
));

// --- Reset & Skip
function resetAll(){
  inPhase=1;
  Object.assign(gearL,{x:360,y:560,angle:0,placedOn:null});
  Object.assign(gearS,{x:690,y:560,angle:0,placedOn:null});
  Object.assign(gearInput,{x:inputShaft.x,y:inputShaft.y,angle:0});
  Object.assign(gearOutput,{x:outputShaft.x,y:outputShaft.y,angle:0});
  [gearL,gearS,gearInput,gearOutput].forEach(updateTransform);
  $('#phaseLabel').textContent='FASE 1 · Montaje';
  $('#hintBox').innerHTML='<strong>Objetivo:</strong> Arrastra los 2 engranajes sueltos a las <em>plazas</em> (anillos de latón) para que conecten el eje de entrada con el de salida. Deben engranar sin solaparse.<br><br>Consejo: al soltar cerca, hacen <em>snap</em> a la plaza.';
  $('#statusText').textContent='Pendiente'; $('#statusText').className='status wip';
  marks.style.display='none'; needle.style.display='none';
  gearOutput.el.classList.remove('targetGlow');
  gearL.draggable=true; gearL.el.classList.add('draggable');
  gearS.draggable=true; gearS.el.classList.add('draggable');
  pegs.forEach(p=>p.ring.classList.remove('pegGlow'));
  overlay('Nivel reiniciado','Vuelve a montar el tren de engranajes.');
}
$('#btnReset').addEventListener('click', resetAll);
$('#btnSkip').addEventListener('click', ()=> inPhase===1 ? goPhase2() : overlay('Fin','Has completado el prototipo.'));

// Overlay inicial
overlay('¡Bienvenido/a!','Fase 1: coloca los engranajes para conectar entrada y salida. Luego, en la fase 2, alinea el puntero con un punto luminoso.');