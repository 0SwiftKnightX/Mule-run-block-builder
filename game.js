import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';
import {BuildCameraController,BuildAudio,PlacementMotion,XRInputBridge} from './build-foundation.js';

// MYTHOS is deliberately dependency-light: rendering is Three.js; movement and
// vehicle dynamics use a compact deterministic arcade simulation.
const $ = (s) => document.querySelector(s);
const touchDevice = matchMedia('(pointer:coarse)').matches;
const PARTS = {
  dirt:{id:'dirt',name:'Dirt Block',category:'structural',size:[1,1,1],mass:18,health:40,color:0x876644},
  cube:{id:'cube',name:'Basic Cube',category:'structural',size:[1,1,1],mass:12,health:80,color:0xe8b52e},
  long:{id:'long',name:'Long Block',category:'structural',size:[1,1,2],mass:20,health:110,color:0xe59b2e},
  small:{id:'small',name:'Small Block',category:'structural',size:[1,.5,1],mass:7,health:45,color:0xf0d66d},
  reinforced:{id:'reinforced',name:'Reinforced',category:'structural',size:[1,1,1],mass:28,health:180,color:0x77858a},
  wheel:{id:'wheel',name:'Wheel',category:'vehicle',size:[1,1,1],mass:9,health:75,color:0x20272a,grip:.92,radius:.48,steering:true,round:true},
  steering:{id:'steering',name:'Steering Wheel',category:'vehicle',size:[1,1,1],mass:4,health:45,color:0x42d5ce},
  seat:{id:'seat',name:'Driver Seat',category:'vehicle',size:[1,1,1],mass:10,health:90,color:0xc85042},
  engine:{id:'engine',name:'Basic Engine',category:'vehicle',size:[1,1,1],mass:32,health:100,color:0xe76336,power:18,maxSpeed:22,accel:9,fuelUse:.045},
  engine2:{id:'engine2',name:'Improved Engine',category:'vehicle',size:[1,1,1],mass:40,health:140,color:0xd73b30,power:28,maxSpeed:32,accel:13,fuelUse:.07},
  fuel:{id:'fuel',name:'Fuel Tank',category:'vehicle',size:[1,1,1],mass:16,health:70,color:0x55b96f,capacity:100},
  propeller:{id:'propeller',name:'Propeller',category:'vehicle',size:[1,1,1],mass:12,health:55,color:0x6bcbd5,lift:14,round:true}
};

let scene,camera,renderer,clock,raycaster,mouse;
let mode='start', yaw=0, pitch=0, playerYVel=0, onGround=true;
const player={pos:new THREE.Vector3(0,1.7,13)};
const keys={}, obstacles=[], worldMeshes=[];
const buildOrigin=new THREE.Vector3(0,0,-8), spawnPoint=new THREE.Vector3(10,.55,2);
let buildParts=[], history=[], future=[], activePart='cube', activeCategory='structural', rotation=0;
let preview=null, previewSignature='',previewValid=false, previewGrid={x:0,y:0,z:0}, selectedPlaced=null;
let constructionGroup, vehicle=null, buildPlane, buildGrid, stationGlow;
let stick={active:false,id:null,x:0,y:0,sx:0,sy:0}, lookTouch=null;
let toastTimer, lastTime=0;
let buildCamera,buildAudio,placementMotion,xrBridge,snapIndicator,selectionHelper,lastSnapKey='',hoveredRoot=null;
const buildEffects=[];

function toast(msg,error=false){const el=$('#toast');el.textContent=msg;el.className=error?'show error':'show';clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.className='',2200)}
function mat(color,metal=.1){return new THREE.MeshStandardMaterial({color,roughness:.72,metalness:metal})}
function box(w,h,d,color){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));m.castShadow=m.receiveShadow=true;return m}
function setShadow(obj){obj.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});return obj}
function disposeObject(obj){obj.traverse?.(o=>{o.geometry?.dispose?.();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose?.());else o.material?.dispose?.()})}

function init(){
  scene=new THREE.Scene(); scene.background=new THREE.Color(0x9fd5dc); scene.fog=new THREE.Fog(0x9fd5dc,45,125);
  camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.08,240); camera.rotation.order='YXZ';
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,touchDevice?1.25:1.75));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;$('#game').appendChild(renderer.domElement);
  clock=new THREE.Clock();raycaster=new THREE.Raycaster();mouse=new THREE.Vector2();
  scene.add(new THREE.HemisphereLight(0xdffcff,0x5b6656,2.1));const sun=new THREE.DirectionalLight(0xfff1cc,2.4);sun.position.set(-18,28,14);sun.castShadow=true;sun.shadow.mapSize.set(touchDevice?1024:1536,touchDevice?1024:1536);sun.shadow.camera.left=-55;sun.shadow.camera.right=55;sun.shadow.camera.top=55;sun.shadow.camera.bottom=-55;scene.add(sun);
  makeWorld();makeBuildRig();setupBuildFoundation();bindUI();loadBlueprint();updateCatalog();resize();renderer.setAnimationLoop(animate);
}

function makeWorld(){
  const ground=box(120,.4,120,0x7e9a6b);ground.position.y=-.25;scene.add(ground);
  const grid=new THREE.GridHelper(120,60,0x637759,0x738969);grid.position.y=.01;scene.add(grid);
  // Build pad and striped perimeter.
  const pad=box(13,.16,13,0x323d40);pad.position.copy(buildOrigin).y=.02;scene.add(pad);
  for(let i=-6;i<=6;i+=2){const stripe=box(1,.02,.32,0xe9bd31);stripe.position.set(i,.12,-1.7);scene.add(stripe);const s2=stripe.clone();s2.position.z=-14.3;scene.add(s2)}
  // Garage gantry frames the construction zone.
  [-6.5,6.5].forEach(x=>{const post=box(.45,5,.45,0x374349);post.position.set(x,2.5,-8);scene.add(post)});const beam=box(13.5,.5,.5,0x374349);beam.position.set(0,5,-8);scene.add(beam);
  const sign=box(4,.8,.18,0xf0be2c);sign.position.set(0,4.7,-7.65);scene.add(sign);
  // Build terminal.
  const station=box(1.5,1.8,1.2,0x273238);station.position.set(-7.7,.9,-8);scene.add(station);stationGlow=box(1.05,.75,.04,0x48d9d2);stationGlow.position.set(-7.7,1.15,-7.38);scene.add(stationGlow);
  // Obstacles and simple ramps.
  addObstacle(22,1,-5,3,2,8,0xb7693d);
  addObstacle(-19,.75,10,8,1.5,3,0x65747a);
  addObstacle(8,.6,24,6,1.2,6,0xc7a337);
  makeRamp(-11,0,11,7,3,8,0x4c595d);
  makeRamp(25,0,16,8,4,10,0x515f64);
  // pylons communicate the driving course.
  for(const [x,z] of [[12,-8],[16,-8],[20,-8],[28,4],[28,9],[-14,22],[-8,22]]){const cone=new THREE.Mesh(new THREE.ConeGeometry(.45,1.5,8),mat(0xf06435));cone.position.set(x,.75,z);cone.castShadow=true;scene.add(cone)}
  const marker=new THREE.RingGeometry(2.4,2.7,40);const ring=new THREE.Mesh(marker,new THREE.MeshBasicMaterial({color:0xffca28,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(spawnPoint.x,.02,spawnPoint.z);scene.add(ring);
}
function addObstacle(x,y,z,w,h,d,color){const o=box(w,h,d,color);o.position.set(x,y,z);scene.add(o);obstacles.push({x,z,w,d,h,mesh:o})}
function makeRamp(x,y,z,w,h,d,color){const shape=new THREE.Shape();shape.moveTo(-d/2,0);shape.lineTo(d/2,0);shape.lineTo(d/2,h);shape.closePath();const geo=new THREE.ExtrudeGeometry(shape,{depth:w,bevelEnabled:false});geo.translate(0,0,-w/2);geo.rotateY(Math.PI/2);const r=new THREE.Mesh(geo,mat(color,.2));r.position.set(x,y,z);r.castShadow=r.receiveShadow=true;scene.add(r);r.userData.ramp={x,z,w,d,h};worldMeshes.push(r)}

function makeBuildRig(){
  constructionGroup=new THREE.Group();constructionGroup.position.copy(buildOrigin);scene.add(constructionGroup);
  buildGrid=new THREE.GridHelper(14,14,0x54e1dc,0x4a6b6c);buildGrid.position.copy(buildOrigin);buildGrid.position.y=.13;buildGrid.visible=false;scene.add(buildGrid);
  const pm=new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide});buildPlane=new THREE.Mesh(new THREE.PlaneGeometry(14,14),pm);buildPlane.rotation.x=-Math.PI/2;buildPlane.position.copy(buildOrigin);buildPlane.position.y=.14;scene.add(buildPlane);
}

function setupBuildFoundation(){
  renderer.xr.enabled=true;buildCamera=new BuildCameraController(THREE,camera,renderer.domElement,buildOrigin);buildAudio=new BuildAudio();placementMotion=new PlacementMotion(THREE,scene,camera);
  snapIndicator=new THREE.Group();const ring=new THREE.Mesh(new THREE.TorusGeometry(.34,.035,8,24),new THREE.MeshBasicMaterial({color:0x43d9d2,depthTest:false}));ring.rotation.x=Math.PI/2;ring.userData.kind='valid';snapIndicator.add(ring);
  const checkMat=new THREE.LineBasicMaterial({color:0x43d9d2,depthTest:false}),checkGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.2,0,0),new THREE.Vector3(-.04,-.14,0),new THREE.Vector3(.24,.18,0)]),check=new THREE.Line(checkGeo,checkMat);check.userData.kind='valid';snapIndicator.add(check);
  const badMat=new THREE.LineBasicMaterial({color:0xff5447,depthTest:false}),badGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.22,-.22,0),new THREE.Vector3(.22,.22,0),new THREE.Vector3(0,0,0),new THREE.Vector3(-.22,.22,0),new THREE.Vector3(.22,-.22,0)]),bad=new THREE.Line(badGeo,badMat);bad.userData.kind='invalid';snapIndicator.add(bad);snapIndicator.visible=false;scene.add(snapIndicator);
  xrBridge=new XRInputBridge(THREE,renderer,scene,$('#xrBtn'),{primary:()=>performPrimaryAction({source:'xr'}),rotate:()=>hoveredRoot&&!selectedPlaced?selectPart(hoveredRoot):rotateSelection(),aim:updateBuildRay,session:active=>{if(active&&mode!=='build')enterBuild()},error:()=>toast('XR SESSION COULD NOT START',true)});
}

function createPartObject(item,ghost=false){
  const p=PARTS[item.type], group=new THREE.Group();
  if(item.type==='wheel'){
    const tire=new THREE.Mesh(new THREE.CylinderGeometry(.48,.48,.38,18),new THREE.MeshStandardMaterial({color:0x1a1e20,roughness:.9,transparent:ghost,opacity:ghost?.45:1}));tire.rotation.z=Math.PI/2;group.add(tire);
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.41,14),new THREE.MeshStandardMaterial({color:0xe9b72c,metalness:.55,roughness:.4,transparent:ghost,opacity:ghost?.45:1}));hub.rotation.z=Math.PI/2;group.add(hub);
  }else if(item.type==='propeller'){
    const hub=new THREE.Mesh(new THREE.SphereGeometry(.2,12,8),mat(p.color));group.add(hub);
    const bladeMat=new THREE.MeshStandardMaterial({color:0x3a4448,metalness:.55,roughness:.35,transparent:ghost,opacity:ghost?.45:1});
    const blade= new THREE.Mesh(new THREE.BoxGeometry(.14,.12,1.7),bladeMat);group.add(blade);const blade2=blade.clone();blade2.rotation.y=Math.PI/2;group.add(blade2);group.userData.spinner=blade;
  }else if(item.type==='seat'){
    const base=box(.78,.32,.78,p.color);base.position.y=-.29;group.add(base);const back=box(.78,.85,.22,p.color);back.position.set(0,.18,.31);group.add(back);
  }else if(item.type==='steering'){
    const stem=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,.72,10),mat(0x39464a));stem.rotation.x=.45;group.add(stem);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(.3,.065,8,18),mat(p.color,.3));rim.position.set(0,.3,-.13);rim.rotation.x=-.42;group.add(rim);
  }else if(item.type==='engine'||item.type==='engine2'){
    group.add(box(.88,.76,.88,p.color));for(let i=-1;i<=1;i++){const rib=box(.95,.07,.08,0x30373a);rib.position.set(0,.18+i*.2,.45);group.add(rib)}
  }else if(item.type==='fuel'){
    group.add(box(.82,.82,.82,p.color));const cap=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.1,10),mat(0xf0c42e));cap.position.y=.46;group.add(cap);
  }else{
    const dims=p.size;const mesh=box(dims[0]*.96,dims[1]*.96,dims[2]*.96,p.color,item.type==='reinforced'?.55:.08);group.add(mesh);
    if(item.type==='reinforced'){const band=box(dims[0]*1.01,.13,dims[2]*1.01,0x3d494e);group.add(band)}
  }
  group.rotation.y=(item.rot||0)*Math.PI/2;setShadow(group);group.userData.part=item;group.traverse(o=>{if(o.isMesh){o.userData.partRoot=group;if(ghost){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.42;o.material.depthWrite=false}}});
  return group;
}
function rotatedSize(item){const s=PARTS[item.type].size;if((item.rot||0)%2)return [s[2],s[1],s[0]];return [...s]}
function gridToLocal(item){const s=rotatedSize(item);return new THREE.Vector3(item.x+s[0]/2,item.y+s[1]/2,item.z+s[2]/2)}
function refreshConnections(){
  const sets=new Map(buildParts.map(p=>[p.uid,new Set(cellsFor(p))]));buildParts.forEach(p=>{p.componentId=p.uid;p.componentType=p.type;p.transform={position:[p.x,p.y,p.z],rotation:[0,(p.rot||0)*90,0]};p.connections=[];p.parentId=null});
  for(let i=0;i<buildParts.length;i++)for(let j=i+1;j<buildParts.length;j++){const a=buildParts[i],b=buildParts[j],bs=sets.get(b.uid);let face=null;for(const cell of sets.get(a.uid)){const [x,y,z]=cell.split(',').map(Number);for(const [dx,dy,dz,label] of [[1,0,0,'+X'],[-1,0,0,'-X'],[0,1,0,'+Y'],[0,-1,0,'-Y'],[0,0,1,'+Z'],[0,0,-1,'-Z']])if(bs.has(`${x+dx},${y+dy},${z+dz}`)){face=label;break}if(face)break}if(face){a.connections.push({componentId:b.uid,type:'grid-face',face});b.connections.push({componentId:a.uid,type:'grid-face',face:'opposite'});if(!b.parentId)b.parentId=a.uid}}
}
function rebuildConstruction(){
  refreshConnections();[...constructionGroup.children].forEach(disposeObject);constructionGroup.clear();
  buildParts.forEach(item=>{const obj=createPartObject(item);obj.position.copy(gridToLocal(item));obj.userData.part=item;constructionGroup.add(obj)});
  updateMass();
}
function cellsFor(item){const s=rotatedSize(item),out=[];for(let x=0;x<Math.ceil(s[0]);x++)for(let y=0;y<Math.ceil(s[1]);y++)for(let z=0;z<Math.ceil(s[2]);z++)out.push(`${item.x+x},${item.y+y},${item.z+z}`);return out}
function validatePlacement(item,ignoreId=null){
  const size=rotatedSize(item);if(item.y<0||item.x<-6||item.z<-6||item.x+size[0]>7||item.z+size[2]>7||item.y+size[1]>8)return {valid:false,code:'bounds',reason:'OUTSIDE BUILD VOLUME'};
  const occupied=new Set();buildParts.forEach(p=>{if(p.uid!==ignoreId)cellsFor(p).forEach(c=>occupied.add(c))});
  const cells=cellsFor(item);if(cells.some(c=>occupied.has(c)))return {valid:false,code:'overlap',reason:'SPACE IS ALREADY OCCUPIED'};
  const others=buildParts.filter(p=>p.uid!==ignoreId);if(!others.length)return PARTS[item.type].category==='structural'?{valid:true,code:'foundation',reason:'FOUNDATION POSITION READY'}:{valid:false,code:'foundation-type',reason:'START WITH A STRUCTURAL BLOCK'};
  for(const c of cells){const [x,y,z]=c.split(',').map(Number);if([[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].some(d=>occupied.has(`${x+d[0]},${y+d[1]},${z+d[2]}`)))return {valid:true,code:'attached',reason:'FACE CONNECTION READY'}}
  return {valid:false,code:'disconnected',reason:'MOVE CLOSER TO A CONNECTED FACE'};
}
function canPlace(item,ignoreId=null){return validatePlacement(item,ignoreId).valid}
function getPreviewItem(){const src=selectedPlaced||{type:activePart,rot:rotation};return {...src,x:previewGrid.x,y:previewGrid.y,z:previewGrid.z,rot:rotation,uid:selectedPlaced?.uid||'preview'}}
function syncHeldVisual(){if(!placementMotion)return;const item={type:selectedPlaced?.type||activePart,rot:rotation,x:0,y:0,z:0};placementMotion.setHeld(createPartObject(item,true))}
function updateSelectionVisual(){
  if(selectionHelper){scene.remove(selectionHelper);selectionHelper.geometry?.dispose();selectionHelper.material?.dispose();selectionHelper=null}
  if(!selectedPlaced)return;const root=constructionGroup.children.find(o=>o.userData.part?.uid===selectedPlaced.uid);if(!root)return;selectionHelper=new THREE.BoxHelper(root,0x43d9d2);selectionHelper.material.depthTest=false;selectionHelper.material.transparent=true;selectionHelper.material.opacity=.95;scene.add(selectionHelper);
}
function updateBuildReadout(item,validation){
  const panel=$('#buildReadout');panel.classList.toggle('invalid',!validation.valid);$('#buildActionLabel').textContent=selectedPlaced?'MOVE / ROTATE PREVIEW':validation.valid?'PLACEMENT READY':'PLACEMENT BLOCKED';$('#buildReason').textContent=validation.reason;$('#buildCoords').textContent=`X ${String(item.x).padStart(2,'0')} · Y ${String(item.y).padStart(2,'0')} · Z ${String(item.z).padStart(2,'0')} · ${(item.rot%4)*90}°`;
  $('#placeBtn').disabled=!validation.valid;$('#cancelMoveBtn').disabled=!selectedPlaced;$('#toolbarRemoveBtn').disabled=!selectedPlaced;const info=$('#selectionInfo');info.classList.toggle('editing',!!selectedPlaced);info.querySelector('span').textContent=selectedPlaced?'EDITING':'HELD';info.querySelector('b').textContent=PARTS[item.type].name.toUpperCase();$('#selectionDetail').textContent=selectedPlaced?'ORIGINAL PRESERVED UNTIL CONFIRM':'READY TO PLACE';
}
function cancelMove(){if(!selectedPlaced)return;selectedPlaced=null;rotation=0;updateSelectionVisual();syncHeldVisual();refreshPreview();buildAudio.play('select');toast('MOVE CANCELLED — ORIGINAL RESTORED')}
function snapshot(){history.push(JSON.stringify(buildParts));if(history.length>40)history.shift();future=[]}
function undo(){if(!history.length){buildAudio?.play('invalid');return toast('NOTHING TO UNDO',true)}future.push(JSON.stringify(buildParts));buildParts=JSON.parse(history.pop());selectedPlaced=null;rebuildConstruction();updateSelectionVisual();syncHeldVisual();refreshPreview();buildAudio?.play('select');toast('UNDO COMPLETE')}
function redo(){if(!future.length){buildAudio?.play('invalid');return toast('NOTHING TO REDO',true)}history.push(JSON.stringify(buildParts));buildParts=JSON.parse(future.pop());selectedPlaced=null;rebuildConstruction();updateSelectionVisual();syncHeldVisual();refreshPreview();buildAudio?.play('select');toast('REDO COMPLETE')}
function removeSelected(){if(!selectedPlaced){buildAudio.play('invalid');return toast('SELECT A PART FIRST',true)}snapshot();buildParts=buildParts.filter(p=>p.uid!==selectedPlaced.uid);selectedPlaced=null;rebuildConstruction();updateSelectionVisual();syncHeldVisual();refreshPreview();buildAudio.play('remove');toast('PART REMOVED — UNDO AVAILABLE')}
function rotateSelection(){
  const next=(rotation+1)%4,test={...getPreviewItem(),rot:next};if(selectedPlaced&&!canPlace(test,selectedPlaced.uid)){buildAudio.play('invalid');return toast(validatePlacement(test,selectedPlaced.uid).reason,true)}rotation=next;syncHeldVisual();refreshPreview();buildAudio.play('rotate');
}
function updateMass(){const mass=buildParts.reduce((n,p)=>n+PARTS[p.type].mass,0);$('#massReadout').textContent=mass+' KG'}
function updateCatalog(){
  const list=Object.values(PARTS).filter(p=>p.category===activeCategory);$('#parts').innerHTML=list.map(p=>`<button class="part ${p.id===activePart?'active':''}" data-id="${p.id}" data-round="${!!p.round}" style="--part:#${p.color.toString(16).padStart(6,'0')}"><i class="part-icon"></i><span>${p.name}</span></button>`).join('');
  $('#parts').querySelectorAll('.part').forEach(el=>el.onclick=()=>{activePart=el.dataset.id;rotation=0;selectedPlaced=null;updateSelectionVisual();updateCatalog();syncHeldVisual();refreshPreview();buildAudio?.play('select')});
  const p=PARTS[activePart];$('#partInfo').innerHTML=`<b>${p.name.toUpperCase()}</b>${p.mass} KG · ${p.health} HP · ${p.size.join(' × ')} GRID${p.power?` · ${p.power} POWER`:''}${p.grip?` · ${Math.round(p.grip*100)}% GRIP`:''}`;
}
function refreshPreview(){
  if(mode!=='build')return;const item=getPreviewItem(),validation=validatePlacement(item,selectedPlaced?.uid),signature=`${item.type}:${item.rot}`;
  if(!preview||previewSignature!==signature){if(preview){scene.remove(preview);disposeObject(preview)}preview=createPartObject(item,true);const arrow=new THREE.ArrowHelper(new THREE.Vector3(0,0,1),new THREE.Vector3(0,rotatedSize(item)[1]*.62,0),.72,0xffffff,.2,.12);arrow.userData.orientationCue=true;preview.add(arrow);previewSignature=signature;scene.add(preview)}
  const lp=gridToLocal(item);preview.position.copy(buildOrigin).add(lp);preview.rotation.y=(item.rot||0)*Math.PI/2;preview.userData.part=item;previewValid=validation.valid;preview.traverse(o=>{if(o.isMesh&&!o.userData.orientationCue){o.material.color.setHex(previewValid?PARTS[item.type].color:0xff3e35);o.material.wireframe=!previewValid}});
  snapIndicator.position.copy(preview.position).add(new THREE.Vector3(0,rotatedSize(item)[1]*.62,0));snapIndicator.visible=true;snapIndicator.children.forEach(o=>o.visible=o.userData.kind===(previewValid?'valid':'invalid'));const snapKey=`${item.x},${item.y},${item.z},${item.rot},${previewValid}`;if(snapKey!==lastSnapKey&&previewValid&&lastSnapKey)buildAudio.play('snap');lastSnapKey=snapKey;updateBuildReadout(item,validation);
}
function resolveBuildRay(){
  const hit=raycaster.intersectObjects([...constructionGroup.children,buildPlane],true)[0];if(!hit)return;
  const root=hit.object.userData.partRoot;hoveredRoot=root||null;
  if(root&&!selectedPlaced){
    const p=root.userData.part,n=hit.face?.normal.clone()||new THREE.Vector3(0,1,0);n.transformDirection(hit.object.matrixWorld).round();const s=rotatedSize({...p,rot:rotation});previewGrid={x:p.x+(n.x>0?rotatedSize(p)[0]:n.x<0?-s[0]:0),y:p.y+(n.y>0?rotatedSize(p)[1]:n.y<0?-s[1]:0),z:p.z+(n.z>0?rotatedSize(p)[2]:n.z<0?-s[2]:0)};
  }else{const local=hit.point.clone().sub(buildOrigin);previewGrid={x:Math.floor(local.x),y:selectedPlaced&&root?Math.max(0,Math.floor(local.y+.02)):0,z:Math.floor(local.z)}}refreshPreview();
}
function buildPointer(e){if(mode!=='build')return;const rect=renderer.domElement.getBoundingClientRect();mouse.x=((e.clientX-rect.left)/rect.width)*2-1;mouse.y=-((e.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(mouse,camera);resolveBuildRay()}
function updateBuildRay(ray){if(mode!=='build')return;raycaster.set(ray.origin,ray.direction);resolveBuildRay()}
function selectPart(root){
  if(!root?.userData.part)return;selectedPlaced=root.userData.part;activePart=selectedPlaced.type;rotation=selectedPlaced.rot||0;previewGrid={x:selectedPlaced.x,y:selectedPlaced.y,z:selectedPlaced.z};updateCatalog();updateSelectionVisual();syncHeldVisual();refreshPreview();buildAudio.play('grab');toast('PART HELD — ORIGINAL SAFE UNTIL CONFIRM');
}
function emitPlacementPulse(position){const mesh=new THREE.Mesh(new THREE.RingGeometry(.12,.2,20),new THREE.MeshBasicMaterial({color:0x43d9d2,side:THREE.DoubleSide,transparent:true,depthTest:false}));mesh.rotation.x=-Math.PI/2;mesh.position.copy(position).add(new THREE.Vector3(0,.52,0));scene.add(mesh);buildEffects.push({mesh,start:performance.now(),duration:360})}
function commitPlacement(item,position){
  snapshot();if(selectedPlaced)buildParts=buildParts.filter(p=>p.uid!==selectedPlaced.uid);buildParts.push(item);selectedPlaced=null;rebuildConstruction();updateSelectionVisual();syncHeldVisual();refreshPreview();emitPlacementPulse(position);buildAudio.play('place');const ui=$('#buildReadout');ui.classList.remove('snap-flash');void ui.offsetWidth;ui.classList.add('snap-flash');toast('BLOCK CONNECTED — UNDO AVAILABLE');
}
function rejectPlacement(validation){buildAudio.play('invalid');const ui=$('#buildReadout');ui.classList.remove('invalid-shake');void ui.offsetWidth;ui.classList.add('invalid-shake');toast(validation.reason,true)}
function performPrimaryAction({source='desktop',select=false}={}){
  if(mode!=='build')return;if((select||source==='touch-select')&&hoveredRoot&&!selectedPlaced)return selectPart(hoveredRoot);
  const item={...getPreviewItem(),uid:selectedPlaced?.uid||(crypto.randomUUID?.()||`part-${Date.now()}`)},validation=validatePlacement(item,selectedPlaced?.uid),position=buildOrigin.clone().add(gridToLocal(item));
  placementMotion.request({valid:validation.valid,position},()=>commitPlacement(item,position),()=>rejectPlacement(validation));
}

function starterBlueprint(){
  const raw=[
    ['cube',0,0,-1],['cube',0,0,0],['cube',0,0,1],
    ['wheel',-1,0,-1],['wheel',1,0,-1],['wheel',-1,0,1],['wheel',1,0,1],
    ['engine',0,1,-1],['fuel',0,1,0],['seat',0,1,1],['steering',0,2,0]
  ];return raw.map((p,i)=>({type:p[0],x:p[1],y:p[2],z:p[3],rot:0,uid:`starter-${i}`}));
}
function loadBlueprint(){
  try{const saved=JSON.parse(localStorage.getItem('mythos-blueprint'));if(saved?.parts?.length){buildParts=saved.parts;$('#vehicleName').value=saved.name||'Rover-01'}else buildParts=starterBlueprint()}catch{buildParts=starterBlueprint()}rebuildConstruction();
}
function saveBlueprint(){
  if(!buildParts.length)return toast('NOTHING TO SAVE',true);
  const data={version:1,name:$('#vehicleName').value.trim()||'Untitled',parts:buildParts,updated:new Date().toISOString()};localStorage.setItem('mythos-blueprint',JSON.stringify(data));toast('BLUEPRINT SAVED LOCALLY');return data;
}
function blueprintStats(){
  const count=(type)=>buildParts.filter(p=>p.type===type).length;
  const engines=buildParts.filter(p=>p.type==='engine'||p.type==='engine2').map(p=>PARTS[p.type]);const best=engines.sort((a,b)=>b.power-a.power)[0];
  return {wheels:count('wheel'),seat:count('seat'),steering:count('steering'),propellers:count('propeller'),engine:best,fuelTanks:count('fuel'),mass:buildParts.reduce((n,p)=>n+PARTS[p.type].mass,0)};
}
function spawnVehicle(){
  if(vehicle){scene.remove(vehicle.group);vehicle=null}
  if(!buildParts.length)return toast('BUILD SOMETHING FIRST',true);
  const stats=blueprintStats(),group=new THREE.Group();
  const bounds={minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity,minY:Infinity};
  buildParts.forEach(p=>{const s=rotatedSize(p);bounds.minX=Math.min(bounds.minX,p.x);bounds.maxX=Math.max(bounds.maxX,p.x+s[0]);bounds.minZ=Math.min(bounds.minZ,p.z);bounds.maxZ=Math.max(bounds.maxZ,p.z+s[2]);bounds.minY=Math.min(bounds.minY,p.y)});
  const centerX=(bounds.minX+bounds.maxX)/2,centerZ=(bounds.minZ+bounds.maxZ)/2;
  const wheels=[];
  buildParts.forEach(p=>{const obj=createPartObject(p);const gp=gridToLocal(p);obj.position.set(gp.x-centerX,gp.y-bounds.minY,gp.z-centerZ);group.add(obj);if(p.type==='wheel')wheels.push(obj)});
  group.position.copy(spawnPoint);scene.add(group);
  vehicle={group,parts:JSON.parse(JSON.stringify(buildParts)),stats,wheels,speed:0,yaw:Math.PI,vertical:0,pitch:0,roll:0,fuel:stats.fuelTanks?100:45,engineHealth:100,grounded:true,name:$('#vehicleName').value||'Rover-01',radius:Math.max(1.2,(bounds.maxX-bounds.minX)/2,(bounds.maxZ-bounds.minZ)/2)};
  toast(stats.seat?'VEHICLE SPAWNED AT YELLOW PAD':'SPAWNED — ADD A SEAT TO DRIVE',!stats.seat);$('#objective').innerHTML='GO TO YOUR VEHICLE <kbd>E</kbd>';
}
function enterBuild(){
  if(vehicle&&mode==='drive')exitVehicle();mode='build';document.exitPointerLock?.();$('#modeLabel').textContent='BUILD MODE';$('#objective').textContent='ORBIT · INSPECT · SNAP · PLACE';['#buildPanel','#buildHint','#buildReadout','#buildToolbar'].forEach(s=>$(s).classList.remove('hidden'));['#crosshair','#prompt','#vehicleHud','#mobile'].forEach(s=>$(s).classList.add('hidden'));buildGrid.visible=true;constructionGroup.visible=true;buildCamera.setActive(true);placementMotion.setEnabled(true);
  activePart='cube';selectedPlaced=null;rotation=0;previewGrid={x:1,y:0,z:0};updateCatalog();syncHeldVisual();updateSelectionVisual();refreshPreview();toast('BUILD 001 — CONSTRUCTION CORE ACTIVE');
}
function exitBuild(){
  if(!buildParts.length)return toast('ADD AT LEAST ONE BLOCK',true);saveBlueprint();mode='foot';$('#modeLabel').textContent='ON FOOT';['#buildPanel','#buildHint','#buildReadout','#buildToolbar'].forEach(s=>$(s).classList.add('hidden'));$('#crosshair').classList.remove('hidden');buildGrid.visible=false;constructionGroup.visible=false;buildCamera.setActive(false);placementMotion.setEnabled(false);snapIndicator.visible=false;selectedPlaced=null;updateSelectionVisual();if(preview){scene.remove(preview);preview=null}player.pos.copy(spawnPoint).add(new THREE.Vector3(-3,1.15,0));yaw=-Math.PI/2;pitch=0;spawnVehicle();if(touchDevice)$('#mobile').classList.remove('hidden');else renderer.domElement.requestPointerLock?.();
}
function enterVehicle(){
  if(!vehicle?.stats.seat)return toast('THIS BUILD NEEDS A DRIVER SEAT',true);mode='drive';document.exitPointerLock?.();$('#modeLabel').textContent='DRIVING';['#crosshair','#prompt'].forEach(s=>$(s).classList.add('hidden'));$('#vehicleHud').classList.remove('hidden');if(touchDevice)$('#mobile').classList.remove('hidden');$('#objective').textContent=vehicle.stats.propellers?'WASD DRIVE · SPACE LIFT · E EXIT':'WASD DRIVE · SPACE BRAKE · E EXIT';$('#hudVehicleName').textContent=vehicle.name.toUpperCase();toast(vehicle.stats.engine?'IGNITION ON':'NO ENGINE — COAST ONLY',!vehicle.stats.engine);
}
function exitVehicle(){
  if(!vehicle)return;mode='foot';player.pos.copy(vehicle.group.position).add(new THREE.Vector3(2,1.7,2));yaw=vehicle.yaw+Math.PI;pitch=0;$('#modeLabel').textContent='ON FOOT';$('#vehicleHud').classList.add('hidden');$('#crosshair').classList.remove('hidden');$('#objective').innerHTML='RETURN TO GARAGE OR RE-ENTER <kbd>E</kbd>';if(!touchDevice)renderer.domElement.requestPointerLock?.();
}
function interact(){
  if(mode==='drive')return exitVehicle();if(mode!=='foot')return;
  const dGarage=Math.hypot(player.pos.x-buildOrigin.x,player.pos.z-buildOrigin.z);const dVehicle=vehicle?Math.hypot(player.pos.x-vehicle.group.position.x,player.pos.z-vehicle.group.position.z):999;
  if(!vehicle)return enterBuild();if(dVehicle<4)return enterVehicle();if(dGarage<8)return enterBuild();toast('MOVE CLOSER TO THE GARAGE OR VEHICLE',true);
}

function bindUI(){
  $('#startBtn').onclick=()=>{$('#start').classList.add('hidden');$('#topbar').classList.remove('hidden');mode='foot';buildAudio.unlock();enterBuild()};
  $('#helpBtn').onclick=()=>{$('#help').showModal();document.exitPointerLock?.()};$('#helpClose').onclick=()=>{$('#help').close();if(mode==='foot'&&!touchDevice)renderer.domElement.requestPointerLock?.()};
  $('#closeBuild').onclick=$('#finishBtn').onclick=exitBuild;$('#saveBtn').onclick=saveBlueprint;$('#clearBtn').onclick=()=>{snapshot();buildParts=[];selectedPlaced=null;rebuildConstruction();updateSelectionVisual();syncHeldVisual();refreshPreview();buildAudio.play('remove');toast('BUILD GRID CLEARED — UNDO AVAILABLE')};
  $('#undoBtn').onclick=undo;$('#redoBtn').onclick=redo;$('#rotateBtn').onclick=$('#rotateLeftBtn').onclick=rotateSelection;$('#deleteBtn').onclick=$('#toolbarRemoveBtn').onclick=removeSelected;$('#placeBtn').onclick=()=>performPrimaryAction({source:'touch-button'});$('#cancelMoveBtn').onclick=cancelMove;$('#focusBtn').onclick=()=>{const target=selectedPlaced?buildOrigin.clone().add(gridToLocal(selectedPlaced)):preview?.position||buildOrigin;buildCamera.focus(target);buildAudio.play('select')};
  document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{activeCategory=t.dataset.cat;document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===t));const first=Object.values(PARTS).find(p=>p.category===activeCategory);activePart=first.id;selectedPlaced=null;updateCatalog();refreshPreview()});
  addEventListener('resize',resize);addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='KeyE'&&!e.repeat)interact();if(e.code==='KeyR'&&!e.repeat&&mode==='build')rotateSelection();if((e.code==='Delete'||e.code==='Backspace')&&mode==='build')removeSelected();if(e.ctrlKey&&e.code==='KeyZ'){e.preventDefault();undo()}if(e.ctrlKey&&e.code==='KeyY'){e.preventDefault();redo()}if(e.code==='Escape'&&mode==='build'&&selectedPlaced){e.preventDefault();cancelMove()}else if(e.code==='Escape'&&mode!=='start'&&!$('#help').open)$('#help').showModal()});addEventListener('keyup',e=>keys[e.code]=false);
  renderer.domElement.addEventListener('mousemove',e=>{if(mode==='foot'&&document.pointerLockElement===renderer.domElement){yaw-=e.movementX*.0024;pitch=Math.max(-1.45,Math.min(1.45,pitch-e.movementY*.0024))}});
  renderer.domElement.addEventListener('pointerdown',e=>{if(mode!=='build')return;buildAudio.unlock();buildPointer(e);buildCamera.pointerDown(e);renderer.domElement.setPointerCapture?.(e.pointerId)});
  renderer.domElement.addEventListener('pointermove',e=>{if(mode!=='build')return;const cameraMoved=buildCamera.pointerMove(e);if(!cameraMoved)buildPointer(e)});
  renderer.domElement.addEventListener('pointerup',e=>{if(mode!=='build')return;const dragged=buildCamera.pointerUp(e);if(dragged)return;buildPointer(e);if(e.pointerType==='touch'){if(hoveredRoot&&!selectedPlaced)performPrimaryAction({source:'touch-select'});else buildAudio.play('snap')}else if(e.button===0)performPrimaryAction({source:'desktop',select:e.shiftKey})});
  renderer.domElement.addEventListener('pointercancel',e=>buildCamera.pointerUp(e));
  renderer.domElement.addEventListener('wheel',e=>{if(mode==='build'){e.preventDefault();buildCamera.zoom(Math.sign(e.deltaY)*1.2)}},{passive:false});renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());renderer.domElement.addEventListener('click',()=>{if(mode==='foot'&&!touchDevice&&document.pointerLockElement!==renderer.domElement)renderer.domElement.requestPointerLock?.()});
  setupTouch();
}

function setupTouch(){
  const base=$('#stick'),nub=base.querySelector('i');
  base.addEventListener('pointerdown',e=>{stick.active=true;stick.id=e.pointerId;stick.sx=e.clientX;stick.sy=e.clientY;base.setPointerCapture(e.pointerId)});
  base.addEventListener('pointermove',e=>{if(!stick.active||e.pointerId!==stick.id)return;stick.x=Math.max(-1,Math.min(1,(e.clientX-stick.sx)/42));stick.y=Math.max(-1,Math.min(1,(e.clientY-stick.sy)/42));nub.style.transform=`translate(${stick.x*28}px,${stick.y*28}px)`});
  const end=e=>{if(e.pointerId!==stick.id)return;stick.active=false;stick.x=stick.y=0;nub.style.transform=''};base.addEventListener('pointerup',end);base.addEventListener('pointercancel',end);
  const look=$('#lookZone');look.addEventListener('pointerdown',e=>{lookTouch={id:e.pointerId,x:e.clientX,y:e.clientY};look.setPointerCapture(e.pointerId)});look.addEventListener('pointermove',e=>{if(!lookTouch||e.pointerId!==lookTouch.id||mode!=='foot')return;yaw-=(e.clientX-lookTouch.x)*.006;pitch=Math.max(-1.4,Math.min(1.4,pitch-(e.clientY-lookTouch.y)*.006));lookTouch.x=e.clientX;lookTouch.y=e.clientY});look.addEventListener('pointerup',()=>lookTouch=null);
  $('#mobileE').addEventListener('pointerdown',e=>{e.stopPropagation();interact()});$('#mobileJump').addEventListener('pointerdown',e=>{e.stopPropagation();if(mode==='foot')keys.Space=true;else if(mode==='drive')keys.Space=true});$('#mobileJump').addEventListener('pointerup',()=>keys.Space=false);
}

function updateFoot(dt){
  let f=(keys.KeyW?1:0)-(keys.KeyS?1:0)-stick.y,r=(keys.KeyD?1:0)-(keys.KeyA?1:0)+stick.x;const len=Math.hypot(f,r);if(len>1){f/=len;r/=len}
  const speed=(keys.ShiftLeft?8:5.2),sin=Math.sin(yaw),cos=Math.cos(yaw);player.pos.x+=(-sin*f+cos*r)*speed*dt;player.pos.z+=(-cos*f-sin*r)*speed*dt;
  if(keys.Space&&onGround){playerYVel=6.2;onGround=false}playerYVel-=17*dt;player.pos.y+=playerYVel*dt;if(player.pos.y<1.7){player.pos.y=1.7;playerYVel=0;onGround=true}
  player.pos.x=Math.max(-56,Math.min(56,player.pos.x));player.pos.z=Math.max(-56,Math.min(56,player.pos.z));camera.position.copy(player.pos);camera.rotation.set(pitch,yaw,0);
  const dGarage=Math.hypot(player.pos.x-buildOrigin.x,player.pos.z-buildOrigin.z),dVehicle=vehicle?Math.hypot(player.pos.x-vehicle.group.position.x,player.pos.z-vehicle.group.position.z):999;
  const pr=$('#prompt');if(dGarage<8){pr.classList.remove('hidden');pr.querySelector('span').textContent='OPEN BUILD STATION'}else if(dVehicle<4){pr.classList.remove('hidden');pr.querySelector('span').textContent=vehicle?.stats.seat?'ENTER VEHICLE':'VEHICLE NEEDS A SEAT'}else pr.classList.add('hidden');
  stationGlow.material.emissive?.setHex(dGarage<8?0x39cfc8:0x000000);
}

function rampHeightAt(x,z){
  // Two deterministic launch ramps, rising toward +Z.
  const ramps=[{x:-11,z:11,w:7,d:8,h:3},{x:25,z:16,w:8,d:10,h:4}];
  for(const r of ramps)if(Math.abs(x-r.x)<r.w/2&&z>r.z-r.d/2&&z<r.z+r.d/2)return {height:(z-(r.z-r.d/2))/r.d*r.h,pitch:-Math.atan2(r.h,r.d)};return null;
}
function updateVehicle(dt){
  if(!vehicle)return;const v=vehicle,drive=mode==='drive';let throttle=0,steer=0;if(drive){throttle=(keys.KeyW?1:0)-(keys.KeyS?1:0)-stick.y;steer=(keys.KeyA?1:0)-(keys.KeyD?1:0)-stick.x}
  const engine=v.stats.engine,alive=engine&&v.engineHealth>0&&v.fuel>0,wheelFactor=Math.min(1,v.stats.wheels/4);
  if(alive&&throttle){v.speed+=throttle*engine.accel*(.35+.65*wheelFactor)*dt;v.fuel=Math.max(0,v.fuel-Math.abs(throttle)*engine.fuelUse*dt*10)}else v.speed*=Math.pow(.965,dt*60);
  if(drive&&keys.Space&&!v.stats.propellers)v.speed*=Math.pow(.8,dt*60);
  const max=engine?engine.maxSpeed:4;v.speed=Math.max(-max*.42,Math.min(max,v.speed));if(Math.abs(v.speed)<.02)v.speed=0;
  if(v.stats.wheels&&Math.abs(v.speed)>.05)v.yaw+=steer*Math.min(1,Math.abs(v.speed)/5)*1.35*dt*(v.speed<0?-1:1);
  const old=v.group.position.clone();v.group.position.x+=Math.sin(v.yaw)*v.speed*dt;v.group.position.z+=Math.cos(v.yaw)*v.speed*dt;
  const ramp=rampHeightAt(v.group.position.x,v.group.position.z);const propLift=v.stats.propellers&&drive&&keys.Space&&alive?v.stats.propellers*8:0;
  if(propLift>0){v.vertical+=propLift/Math.max(1,v.stats.mass/35)*dt;v.grounded=false}
  if(ramp&&v.grounded){v.group.position.y=.55+ramp.height;v.pitch=ramp.pitch;if(!rampHeightAt(old.x,old.z)&&Math.abs(v.speed)>12){v.vertical=Math.abs(v.speed)*.22;v.grounded=false}}
  else if(!v.grounded||v.group.position.y>.56){v.vertical-=9.5*dt;v.group.position.y+=v.vertical*dt;v.pitch+=v.vertical*-.006*dt;if(v.group.position.y<=.55){v.group.position.y=.55;v.vertical=0;v.grounded=true;v.pitch=0}}
  else{v.group.position.y=.55;v.pitch*=.9}
  // Course collision response and impact damage.
  for(const o of obstacles){if(Math.abs(v.group.position.x-o.x)<o.w/2+v.radius*.55&&Math.abs(v.group.position.z-o.z)<o.d/2+v.radius*.55&&v.group.position.y<o.h+1){const impact=Math.abs(v.speed);v.group.position.copy(old);v.speed*=-.32;if(impact>6){v.engineHealth=Math.max(0,v.engineHealth-impact*1.8);v.roll+=(Math.random()-.5)*impact*.05;toast('IMPACT — ENGINE DAMAGED',true)}}}
  if(Math.abs(v.group.position.x)>58||Math.abs(v.group.position.z)>58){v.group.position.copy(old);v.speed*=-.35}
  v.roll*=Math.pow(.96,dt*60);if(Math.abs(v.speed)>19&&Math.abs(steer)>.8)v.roll+=steer*.7*dt;v.group.rotation.set(v.pitch,v.yaw,v.roll,'YXZ');
  v.wheels.forEach(w=>w.rotation.x+=v.speed*dt/PARTS.wheel.radius);v.group.traverse(o=>{if(o.userData.spinner)o.userData.spinner.rotation.y+=dt*(alive?18:2)});
  if(drive){const follow=new THREE.Vector3(-Math.sin(v.yaw)*8,4.6,-Math.cos(v.yaw)*8).add(v.group.position);camera.position.lerp(follow,1-Math.pow(.002,dt));camera.lookAt(v.group.position.x,v.group.position.y+1,v.group.position.z);updateHud()}
}
function updateHud(){if(!vehicle)return;$('#speedValue').textContent=Math.round(Math.abs(vehicle.speed)*3.6).toString().padStart(3,'0');$('#engineText').textContent=Math.round(vehicle.engineHealth)+'%';$('#fuelText').textContent=Math.round(vehicle.fuel)+'%';$('#engineBar').style.width=vehicle.engineHealth+'%';$('#fuelBar').style.width=vehicle.fuel+'%'}
function updateBuild(dt){
  if(!renderer.xr.isPresenting)buildCamera.update(dt);placementMotion.update();xrBridge.update(true);if(snapIndicator.visible){const pulse=1+Math.sin(performance.now()*.009)*.08;snapIndicator.scale.setScalar(pulse)}if(selectionHelper)selectionHelper.update();
  for(let i=buildEffects.length-1;i>=0;i--){const fx=buildEffects[i],t=(performance.now()-fx.start)/fx.duration;if(t>=1){scene.remove(fx.mesh);fx.mesh.geometry.dispose();fx.mesh.material.dispose();buildEffects.splice(i,1)}else{fx.mesh.scale.setScalar(1+t*4);fx.mesh.material.opacity=1-t}}
}
function animate(){const dt=Math.min(.04,clock.getDelta());if(mode==='foot')updateFoot(dt);if(mode==='drive')updateVehicle(dt);else if(vehicle)updateVehicle(dt);if(mode==='build')updateBuild(dt);renderer.render(scene,camera)}
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)}

init();
