'use strict';
const frame = document.getElementById('mobile-app'), output = document.getElementById('mobile-results');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label) { for (let i = 0; i < 180; i++) { if (check()) return; await wait(100); } throw new Error('Timed out: ' + label); }
function assert(value, message) { if (!value) throw new Error(message); }
document.getElementById('mobile-run').addEventListener('click', async () => {
  document.getElementById('mobile-run').disabled = true; output.textContent = '';
  try {
    await new Promise(resolve => { frame.onload = resolve; frame.src = '../index.html'; });
    await until(() => frame.contentDocument.getElementById('mode-button')?.disabled === false, 'app ready');
    const w = frame.contentWindow, d = frame.contentDocument;
    for (const width of [320,390,768,1200]) {
      frame.width = width; await wait(100);
      for (const tab of ['library','setup','add','link']) {
        if (tab === 'add') d.getElementById('library-add').click(); else if (tab === 'link') { d.getElementById('tab-library').click(); d.querySelector('[data-link]').click(); } else d.getElementById('tab-' + tab).click(); await wait(30);
        assert(d.documentElement.scrollWidth <= d.documentElement.clientWidth + 2, width + 'px: horizontal overflow on ' + tab);
        const start = d.getElementById('mode-button').getBoundingClientRect();
        assert(start.width >= 44 && start.height >= 44, width + 'px: Start target too small');
      }
      output.textContent += 'PASS Parent panels and Start control at ' + width + 'px\n';
    }
    frame.width = 390; d.getElementById('child-settings-shortcut').click();
    const health = d.getElementById('app-health-heading'); health.focus(); health.scrollIntoView({ block: 'center' });
    output.textContent += '\nALL PHONE LAYOUT CHECKS PASSED — preview left at 390px.\n';
  } catch (error) { output.textContent += '\nFAIL ' + error.stack; }
  finally { document.getElementById('mobile-run').disabled = false; }
});
