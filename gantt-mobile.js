/* One-finger scrolling and synchronized two-finger chart scaling on phones. */
(() => {
  function init() {
    const mobile = matchMedia('(max-width:1024px) and (pointer:coarse)');
    const root = document.documentElement;
    const chart = document.getElementById('main');
    const tableHeader = document.getElementById('thead');
    const ganttContent = document.getElementById('gcontent');
    let frame = 0, wasMobile = false;

    function update() {
      frame = 0;
      const active = mobile.matches && root.dataset.appView === 'gantt' && root.dataset.scheduleAggregate !== 'on';
      if (active) {
        const tableWidth = [...tableHeader.children].reduce((sum, cell) => sum + cell.offsetWidth, 0);
        const ganttWidth = Math.max(chart.clientWidth, parseFloat(ganttContent.style.width) || 0);
        if (tableWidth) chart.style.setProperty('--mobile-table-width', tableWidth + 'px');
        chart.style.setProperty('--mobile-chart-width', ganttWidth + 'px');
        if (!wasMobile) {
          // Clear desktop pane offsets when rotating/resizing into the mobile
          // layout: the shared viewport now scrolls table, bars and date labels.
          for (const id of ['tbody', 'gbody']) {
            const pane = document.getElementById(id);
            pane.scrollTop = 0;
            pane.scrollLeft = 0;
          }
          for (const id of ['ght', 'ghb']) document.getElementById(id).style.transform = '';
        }
      }
      wasMobile = active;
    }
    function scheduleUpdate() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    const contentObserver = new MutationObserver(scheduleUpdate);
    contentObserver.observe(tableHeader, {childList:true});
    contentObserver.observe(ganttContent, {attributes:true, attributeFilter:['style']});
    new MutationObserver(scheduleUpdate).observe(root, {attributes:true, attributeFilter:['data-app-view','data-schedule-aggregate']});
    mobile.addEventListener('change', scheduleUpdate);
    window.addEventListener('resize', scheduleUpdate, {passive:true});
    document.getElementById('mobileShowTable').onclick = () => chart.scrollTo({left:0, behavior:'smooth'});
    document.getElementById('mobileShowGantt').onclick = () => chart.scrollTo({left:parseFloat(chart.style.getPropertyValue('--mobile-table-width')) || 0, behavior:'smooth'});
    let scale=1,pinch=null,suppressClickUntil=0;
    const distance=touches=>Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY);
    const surface=target=>target.closest?.('.sg-chart,#main');
    const enabled=()=>mobile.matches&&root.dataset.appView==='gantt';
    function setScale(value,anchor){
      scale=Math.max(.4,Math.min(2.5,value));
      root.style.setProperty('--mobile-schedule-scale',String(scale));
      document.getElementById('mobileZoomReset').textContent=Math.round(scale*100)+'%';
      if(anchor){
        const rect=anchor.element.getBoundingClientRect();
        anchor.element.scrollLeft=anchor.x-(anchor.clientX-rect.left)/scale;
        window.scrollTo(window.scrollX,scrollY+rect.top+anchor.y*scale-anchor.clientY);
      }
      scheduleUpdate();
    }
    function startPinch(event){
      if(!enabled()||event.touches.length!==2)return;
      const element=surface(event.target);if(!element)return;
      const rect=element.getBoundingClientRect(),clientX=(event.touches[0].clientX+event.touches[1].clientX)/2,clientY=(event.touches[0].clientY+event.touches[1].clientY)/2;
      pinch={element,clientX,clientY,x:element.scrollLeft+(clientX-rect.left)/scale,y:(clientY-rect.top)/scale,distance:distance(event.touches),scale};
      if(event.cancelable)event.preventDefault();
    }
    document.addEventListener('touchstart',startPinch,{passive:false});
    document.addEventListener('touchmove',event=>{
      if(!pinch||event.touches.length!==2||!enabled())return;
      if(event.cancelable)event.preventDefault();
      setScale(pinch.scale*distance(event.touches)/Math.max(1,pinch.distance),pinch);
    },{passive:false});
    function endPinch(event){if(pinch&&event.touches.length<2){pinch=null;suppressClickUntil=Date.now()+350}}
    document.addEventListener('touchend',endPinch,{passive:true});
    document.addEventListener('touchcancel',endPinch,{passive:true});
    document.addEventListener('click',event=>{if(enabled()&&surface(event.target)&&Date.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation()}},true);
    document.getElementById('mobileZoomOut').onclick=()=>setScale(scale-.1);
    document.getElementById('mobileZoomIn').onclick=()=>setScale(scale+.1);
    document.getElementById('mobileZoomReset').onclick=()=>setScale(1);
    scheduleUpdate();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
