// BUILD 001: isolated construction-facing camera, audio, action-motion and XR input.
// Game rules remain in game.js; every input source calls the same operation callbacks.

export class BuildCameraController {
  constructor(THREE,camera,dom,origin){
    this.THREE=THREE;this.camera=camera;this.dom=dom;
    this.target=origin.clone().add(new THREE.Vector3(0,1.4,0));this.desiredTarget=this.target.clone();
    this.radius=12.5;this.desiredRadius=12.5;this.theta=.72;this.phi=.93;
    this.active=false;this.pointers=new Map();this.dragged=new Set();this.pinch=null;
  }
  setActive(value){this.active=value;this.pointers.clear();this.dragged.clear();this.pinch=null}
  pointerDown(e){
    if(!this.active)return false;this.pointers.set(e.pointerId,{id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,startX:e.clientX,startY:e.clientY,type:e.pointerType,button:e.button,pan:e.shiftKey});
    if(this.pointers.size===2){const a=[...this.pointers.values()];this.pinch={distance:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),radius:this.desiredRadius,cx:(a[0].x+a[1].x)/2,cy:(a[0].y+a[1].y)/2}}
    return e.pointerType==='touch'||e.button===1||e.button===2||e.altKey;
  }
  pointerMove(e){
    const p=this.pointers.get(e.pointerId);if(!this.active||!p)return false;
    p.x=e.clientX;p.y=e.clientY;const dx=p.x-p.lastX,dy=p.y-p.lastY;p.lastX=p.x;p.lastY=p.y;
    const totalMove=Math.hypot(p.x-p.startX,p.y-p.startY);if(totalMove>7)this.dragged.add(e.pointerId);
    if(this.pointers.size>=2){
      const a=[...this.pointers.values()],dist=Math.max(10,Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y));
      if(!this.pinch)this.pinch={distance:dist,radius:this.desiredRadius,cx:(a[0].x+a[1].x)/2,cy:(a[0].y+a[1].y)/2};
      this.desiredRadius=Math.max(5,Math.min(24,this.pinch.radius*this.pinch.distance/dist));
      const cx=(a[0].x+a[1].x)/2,cy=(a[0].y+a[1].y)/2;this.pan((cx-this.pinch.cx)*-.006,(cy-this.pinch.cy)*.006);this.pinch.cx=cx;this.pinch.cy=cy;
      this.dragged.add(a[0].id);this.dragged.add(a[1].id);return true;
    }
    const orbit=p.type==='touch'||p.button===1||p.button===2||e.altKey;
    if(orbit&&!p.pan){this.theta-=dx*.006;this.phi=Math.max(.28,Math.min(1.42,this.phi+dy*.005));if(Math.abs(dx)+Math.abs(dy)>3)this.dragged.add(e.pointerId);return true}
    if(orbit&&p.pan){this.pan(dx*-.009,dy*.009);this.dragged.add(e.pointerId);return true}return false;
  }
  pointerUp(e){const was=this.dragged.has(e.pointerId);this.pointers.delete(e.pointerId);this.dragged.delete(e.pointerId);if(this.pointers.size<2)this.pinch=null;return was}
  pan(x,y){const right=new this.THREE.Vector3();this.camera.getWorldDirection(right);right.cross(this.camera.up).normalize();const up=new this.THREE.Vector3(0,1,0);this.desiredTarget.addScaledVector(right,x).addScaledVector(up,y);this.desiredTarget.x=Math.max(-5,Math.min(5,this.desiredTarget.x));this.desiredTarget.y=Math.max(.5,Math.min(5,this.desiredTarget.y));this.desiredTarget.z=Math.max(-13,Math.min(-3,this.desiredTarget.z))}
  zoom(delta){this.desiredRadius=Math.max(5,Math.min(24,this.desiredRadius+delta))}
  focus(worldPoint){this.desiredTarget.copy(worldPoint);this.desiredTarget.y=Math.max(.5,this.desiredTarget.y);this.desiredRadius=Math.max(6,Math.min(14,this.desiredRadius))}
  update(dt){
    if(!this.active)return;const ease=1-Math.pow(.001,dt);this.target.lerp(this.desiredTarget,ease);this.radius+=(this.desiredRadius-this.radius)*ease;
    const sinPhi=Math.sin(this.phi);this.camera.position.set(this.target.x+this.radius*sinPhi*Math.cos(this.theta),this.target.y+this.radius*Math.cos(this.phi),this.target.z+this.radius*sinPhi*Math.sin(this.theta));this.camera.lookAt(this.target);
  }
}

export class BuildAudio {
  constructor(){this.ctx=null;this.enabled=true}
  unlock(){if(!this.enabled)return;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;this.ctx??=new AC();if(this.ctx.state==='suspended')this.ctx.resume()}
  play(kind){
    this.unlock();if(!this.ctx)return;const map={select:[520,.035,'sine'],grab:[260,.05,'triangle'],snap:[760,.04,'sine'],place:[180,.075,'square'],remove:[120,.09,'sawtooth'],invalid:[95,.1,'square'],rotate:[410,.04,'triangle']};const spec=map[kind];if(!spec)return;
    const now=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=spec[2];o.frequency.setValueAtTime(spec[0],now);o.frequency.exponentialRampToValueAtTime(Math.max(45,spec[0]*.72),now+spec[1]);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.055,now+.008);g.gain.exponentialRampToValueAtTime(.0001,now+spec[1]);o.connect(g).connect(this.ctx.destination);o.start(now);o.stop(now+spec[1]+.01);
  }
}

export class PlacementMotion {
  constructor(THREE,scene,camera){
    this.THREE=THREE;this.scene=scene;this.camera=camera;this.rig=new THREE.Group();this.scene.add(this.rig);this.held=null;this.action=null;this.enabled=false;this.releaseRatio=.56;
    const skin=new THREE.MeshStandardMaterial({color:0x263338,roughness:.75}),accent=new THREE.MeshStandardMaterial({color:0x43d9d2,roughness:.55});this.hand=new THREE.Group();
    const palm=new THREE.Mesh(new THREE.BoxGeometry(.32,.16,.42),skin);palm.position.set(.05,-.16,.3);this.hand.add(palm);for(let i=0;i<3;i++){const finger=new THREE.Mesh(new THREE.BoxGeometry(.075,.1,.3),i===1?accent:skin);finger.position.set(-.08+i*.1,-.08,.06);this.hand.add(finger)}this.rig.add(this.hand);
  }
  setHeld(object){if(this.held){this.rig.remove(this.held);this.held.traverse(o=>{o.geometry?.dispose?.();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose?.());else o.material?.dispose?.()})}this.held=object;if(object){object.scale.setScalar(1);object.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.86}});this.rig.add(object)}}
  setEnabled(value){this.enabled=value;this.rig.visible=value;if(!value)this.action=null}
  request(target,commit,reject){
    if(!this.enabled||!this.held)return false;if(this.action&&!this.action.released)return false;
    if(!target.valid){reject?.();this.action={start:performance.now(),invalid:true,released:true};return false}
    this.held.visible=true;this.action={start:performance.now(),duration:210,target:target.position.clone(),commit,released:false,invalid:false};return true;
  }
  update(){
    if(!this.enabled||!this.held)return;const hold=this.camera.localToWorld(new this.THREE.Vector3(.58,-.52,-1.55));let position=hold,scale=.34;
    if(this.action){const t=Math.min(1,(performance.now()-this.action.start)/this.action.duration);if(this.action.invalid){const shake=Math.sin(t*Math.PI*7)*(1-t)*.045;position=hold.clone().add(new this.THREE.Vector3(shake,0,0));if(t>=1)this.action=null}
      else{const reach=Math.min(1,t/this.releaseRatio),smooth=reach*reach*(3-2*reach);position=hold.clone().lerp(this.action.target,smooth*.82);scale=.34+(1-.34)*smooth;if(!this.action.released&&t>=this.releaseRatio){this.action.released=true;this.action.commit?.();this.held.visible=false}if(t>=.72)this.held.visible=true;if(t>=1)this.action=null}}
    this.rig.position.copy(position);this.rig.quaternion.slerp(this.camera.quaternion,.35);this.rig.scale.setScalar(scale);
  }
}

export class XRInputBridge {
  constructor(THREE,renderer,scene,button,callbacks){
    this.THREE=THREE;this.renderer=renderer;this.scene=scene;this.button=button;this.callbacks=callbacks;this.controllers=[];this.supported=false;this.active=false;this.raycaster=new THREE.Raycaster();this.tempMatrix=new THREE.Matrix4();
    this.setupControllers();this.detect();
  }
  setupControllers(){
    const geo=new this.THREE.BufferGeometry().setFromPoints([new this.THREE.Vector3(0,0,0),new this.THREE.Vector3(0,0,-1)]),mat=new this.THREE.LineBasicMaterial({color:0x43d9d2,transparent:true,opacity:.78});
    for(let i=0;i<2;i++){const c=this.renderer.xr.getController(i),line=new this.THREE.Line(geo,mat.clone());line.scale.z=4;line.visible=false;c.add(line);c.userData.ray=line;c.addEventListener('select',()=>this.callbacks.primary?.({source:'xr',controller:c}));c.addEventListener('squeeze',()=>this.callbacks.rotate?.({source:'xr',controller:c}));c.addEventListener('connected',()=>line.visible=true);c.addEventListener('disconnected',()=>line.visible=false);this.scene.add(c);this.controllers.push(c)}
  }
  async detect(){
    if(!navigator.xr){this.setUnavailable('XR UNAVAILABLE');return}try{this.supported=await navigator.xr.isSessionSupported('immersive-vr');if(this.supported){this.button.disabled=false;this.button.textContent='ENTER XR';this.button.onclick=()=>this.toggle()}else this.setUnavailable('XR NOT SUPPORTED')}catch{this.setUnavailable('XR CHECK FAILED')}
  }
  setUnavailable(label){this.button.disabled=true;this.button.textContent=label;this.button.title='WebXR immersive VR is not available in this browser or context'}
  async toggle(){
    if(!this.supported)return;if(this.renderer.xr.isPresenting){await this.renderer.xr.getSession()?.end();return}
    try{const session=await navigator.xr.requestSession('immersive-vr',{optionalFeatures:['local-floor','bounded-floor','hand-tracking']});await this.renderer.xr.setSession(session);this.active=true;this.button.textContent='EXIT XR';session.addEventListener('end',()=>{this.active=false;this.button.textContent='ENTER XR';this.callbacks.session?.(false)});this.callbacks.session?.(true)}catch(err){this.button.textContent='XR START FAILED';this.callbacks.error?.(err)}
  }
  update(enabled){
    if(!this.active||!enabled)return;const c=this.controllers[0];this.tempMatrix.identity().extractRotation(c.matrixWorld);const origin=new this.THREE.Vector3().setFromMatrixPosition(c.matrixWorld),direction=new this.THREE.Vector3(0,0,-1).applyMatrix4(this.tempMatrix).normalize();this.callbacks.aim?.({origin,direction,source:'xr'});
  }
}
