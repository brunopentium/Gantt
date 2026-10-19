/* Two-finger note zoom is local to the sheet; one-finger browser scrolling stays native. */
window.NotesTouch=(()=>{
 'use strict';
 function bind(viewport,api){if(!viewport||viewport.dataset.pinchBound)return;viewport.dataset.pinchBound='true';const pointers=new Set();let pinch=null,engaged=false;
  const pair=touches=>{const [a,b]=touches;return {distance:Math.max(1,Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)),center:{x:(a.clientX+b.clientX)/2,y:(a.clientY+b.clientY)/2}}};
  function begin(event){if(event.touches.length<2)return;event.preventDefault();if(!engaged){engaged=true;api.start()}if(!pinch){const p=pair(event.touches),rect=api.paper().getBoundingClientRect(),zoom=api.zoom();pinch={distance:p.distance,zoom,point:{x:(p.center.x-rect.left)/zoom,y:(p.center.y-rect.top)/zoom}}}}
  viewport.addEventListener('pointerdown',event=>{if(event.pointerType!=='touch')return;pointers.add(event.pointerId);if(pointers.size>=2){event.preventDefault();if(!engaged){engaged=true;api.start()}}},true);
  for(const type of ['pointerup','pointercancel'])viewport.addEventListener(type,event=>pointers.delete(event.pointerId),true);
  viewport.addEventListener('touchstart',begin,{capture:true,passive:false});
  viewport.addEventListener('touchmove',event=>{if(event.touches.length>=2)begin(event);if(!engaged)return;event.preventDefault();if(event.touches.length>=2&&pinch){const p=pair(event.touches);api.set(pinch.zoom*p.distance/pinch.distance,{point:pinch.point,center:p.center})}},{capture:true,passive:false});
  const end=event=>{if(!engaged)return;event.preventDefault();if(event.touches.length===0){pinch=null;engaged=false;pointers.clear();api.finish()}};
  viewport.addEventListener('touchend',end,{capture:true,passive:false});viewport.addEventListener('touchcancel',end,{capture:true,passive:false});
 }
 return {bind};
})();
