/* Native page scrolling and pinch zoom on phones. No touch interception. */
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
        const tableWidth = [...tableHeader.children].reduce((sum, cell) => sum + cell.getBoundingClientRect().width, 0);
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
    scheduleUpdate();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
