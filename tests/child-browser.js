'use strict';
const frame = document.getElementById('child-app'), output = document.getElementById('child-results');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };
async function until(check, label) { for (let i=0;i<240;i++) { try { if (await check()) return; } catch (_) {} await wait(80); } throw new Error('Timed out: '+label); }
const pass = message => { output.textContent += 'PASS '+message+'\n'; };
let w,d,reader,tagCode,storyId;
async function load() { await new Promise(resolve=>{frame.onload=resolve;frame.src='../index.html?child-check='+Date.now();}); w=frame.contentWindow;d=frame.contentDocument;await until(()=>!d.getElementById('mode-button').disabled&&d.querySelectorAll('#story-grid .story-card').length>=4,'app ready'); }
function change(id,value) { const el=d.getElementById(id); if(typeof value==='boolean')el.checked=value;else el.value=String(value);el.dispatchEvent(new w.Event('change')); }
function pointer(el) { el.dispatchEvent(new w.PointerEvent('pointerdown',{button:0,pointerId:7,isPrimary:true,bubbles:true,cancelable:true})); }
async function holdExit(seconds) { const button=d.getElementById('child-exit');button.dispatchEvent(new w.KeyboardEvent('keydown',{key:' ',repeat:false,cancelable:true}));await until(()=>!d.body.classList.contains('child-active'),'held exit '+seconds); }
function tagEvent() { return {message:{records:[{recordType:'text',data:new w.TextEncoder().encode(tagCode)}]}}; }
function fileInput(id,file) { const transfer=new w.DataTransfer();transfer.items.add(file);d.getElementById(id).files=transfer.files;d.getElementById(id).dispatchEvent(new w.Event('change')); }
document.getElementById('run-child').onclick=async()=>{
  document.getElementById('run-child').disabled=true;output.textContent='';
  try {
    await load();await w.StoryStore.putSetting('preferences',{spoken:false,sounds:false,keepAwake:false});await w.StoryStore.putSetting('draft',null);await load();
    assert(d.getElementById('child-screen-black').checked,'Dark screen is not default');assert(!d.getElementById('child-show-stop').checked,'Stop should be optional');
    assert(!d.querySelector('#child-view [data-play],#child-view select,#child-view form'),'Child view contains a chooser');
    pass('Dark screen is the default; child mode has no story picker or code-entry controls');
    Object.defineProperty(w,'NDEFReader',{configurable:true,value:undefined});d.getElementById('mode-button').click();await wait(50);
    assert(!d.body.classList.contains('child-active')&&d.getElementById('app-error').textContent.includes('Android'),'Unsupported NFC did not stay in adult mode');
    Object.defineProperty(w,'NDEFReader',{configurable:true,value:class{async scan(){throw new w.DOMException('Test denial','NotAllowedError');}}});
    d.getElementById('mode-button').click();await until(()=>!d.body.classList.contains('child-active'),'NFC denial returns to adult');
    assert(!w.sessionStorage.getItem('storytouch-child-active'),'Failed start kept a child-session flag');
    pass('Unsupported or denied NFC returns adults to setup rather than exposing child story buttons');
    Object.defineProperty(w,'NDEFReader',{configurable:true,value:class{constructor(){reader=this;}async scan({signal}){this.signal=signal;}}});
    const source=(await w.StoryStore.all('stories')).find(s=>s.source==='example');
    const title='Quiet bell '+Date.now();d.getElementById('library-add').click();d.getElementById('source-import').click();d.getElementById('story-title').value=title;
    fileInput('audio-file',new w.File([source.blob],'Quiet bell.mp3',{type:'audio/mpeg'}));await until(()=>!d.getElementById('preview-wrap').hidden,'audio import');
    const canvas=d.createElement('canvas');canvas.width=canvas.height=48;const ctx=canvas.getContext('2d');ctx.fillStyle='#bdcfae';ctx.fillRect(0,0,48,48);ctx.fillStyle='#314c3a';ctx.fillRect(10,10,28,28);
    const picture=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    fileInput('story-image',new w.File([picture],'picture.png',{type:'image/png'}));await until(()=>!d.getElementById('story-image-preview').hidden,'picture decode');
    d.getElementById('story-transcript').value='A familiar voice. A quiet little story.';d.getElementById('story-form').requestSubmit();
    await until(()=>!d.getElementById('panel-link').hidden,'save goes directly to link');
    const saved=(await w.StoryStore.all('stories')).find(s=>s.title===title);storyId=saved.id;assert(saved.image?.type==='image/png','Picture not stored');
    assert(d.getElementById('link-story').value===storyId,'Saved story had to be selected again');
    d.getElementById('read-link').click();await until(()=>reader?.onreading,'tag reader ready');tagCode='QA-'+Date.now();await reader.onreading(tagEvent());
    await until(()=>!d.getElementById('link-complete').hidden,'link success');assert((await w.StoryStore.all('links')).some(l=>l.storyId===storyId),'Tag link not saved');
    d.getElementById('link-done').click();pass('Upload audio and a picture, save, tap a tag, and return to stories without reselecting the story');
    const audio=d.getElementById('story-audio');let paused=true,head=0;
    Object.defineProperty(audio,'paused',{get:()=>paused});Object.defineProperty(audio,'ended',{get:()=>false});Object.defineProperty(audio,'currentTime',{get:()=>head,set:v=>{head=v;}});
    audio.play=async()=>{paused=false;audio.dispatchEvent(new w.Event('play'));};audio.pause=()=>{paused=true;audio.dispatchEvent(new w.Event('pause'));};
    d.getElementById('mode-button').click();await until(()=>d.body.classList.contains('black-child')&&reader?.onreading,'dark mode');
    const visible=()=>[...d.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width&&b.getBoundingClientRect().height&&w.getComputedStyle(b).visibility!=='hidden');
    assert(visible().length===1&&visible()[0].id==='child-exit','Dark screen exposes extra controls');
    const handle=d.getElementById('child-exit').getBoundingClientRect();assert(handle.width<=100&&handle.height>=44,'Parent handle is not visually small with an accessible hit area');
    assert(w.getComputedStyle(d.getElementById('child-view')).backgroundColor==='rgb(0, 0, 0)','Dark screen is not pure black');
    pass('Pure black screen has only a small parent handle with a 44px touch target');
    await reader.onreading(tagEvent());assert(!paused,'Tag did not play');head=12;pointer(d.getElementById('child-view'));
    assert(paused&&!reader.signal.aborted,'Touch pause stopped NFC');await wait(1250);await reader.onreading(tagEvent());assert(!paused&&head===12,'Retapping the object did not resume the paused position');
    pass('Only tags choose stories; screen touch pauses and the object resumes playback without stopping NFC');
    await holdExit(3);d.getElementById('child-settings-shortcut').click();change('child-show-stop',true);change('exit-method-taps',true);change('exit-tap-count',3);
    d.getElementById('mode-button').click();await until(()=>d.body.classList.contains('black-child'),'dark Stop option');
    assert(visible().length===2&&!d.getElementById('child-stop-audio').hidden,'Optional red Stop is missing');
    await reader.onreading(tagEvent());head=7;pointer(d.getElementById('child-stop-audio'));d.getElementById('child-stop-audio').click();
    assert(paused&&head===0&&!reader.signal.aborted&&d.body.classList.contains('black-child'),'Stop changed mode or NFC');
    pass('Optional red Stop remains the only playback control on black and stops media without stopping tag listening');
    d.getElementById('child-exit').click();d.getElementById('child-exit').click();assert(d.body.classList.contains('child-active'),'Too few taps exited');await wait(1100);
    d.getElementById('child-exit').click();d.getElementById('child-exit').click();assert(d.body.classList.contains('child-active'),'Spaced taps accumulated');d.getElementById('child-exit').click();
    await until(()=>!d.body.classList.contains('child-active'),'three tap exit');assert(reader.signal.aborted,'Parent exit did not stop NFC');
    pass('Consecutive-tap exit rejects incomplete or spaced gestures and cleans up NFC on success');
    d.getElementById('child-screen-now').click();change('exit-method-hold',true);change('exit-hold-seconds',2);d.getElementById('mode-button').click();await until(()=>d.body.classList.contains('child-active'),'now playing mode');
    assert(!d.body.classList.contains('black-child')&&!d.getElementById('child-idle').hidden,'Now-playing idle is wrong');await reader.onreading(tagEvent());
    await until(()=>d.querySelector('#child-art img')?.naturalWidth>0,'associated picture');
    assert(d.getElementById('child-story-title').textContent===title&&d.getElementById('child-story-text').textContent.includes('quiet little'),'Selected story content missing');
    assert(!d.getElementById('player-drawer-body').hidden&&!d.getElementById('player').inert,'Now-playing controls unavailable');
    assert(!d.querySelector('#child-view [data-play],#child-view select,#child-view form'),'Now playing contains a shelf');
    pass('Now playing shows only the tagged story, decoded picture, associated words and usable playback controls');
    pointer(d.getElementById('player-toggle'));d.getElementById('player-toggle').dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true,detail:1}));assert(paused,'One touch paused then restarted media');
    d.getElementById('player-toggle').click();await until(()=>!paused,'Play resumes');pass('A pause touch cannot immediately restart media through the underlying Play button');
    for(const width of [320,390,768,1200]){frame.style.width=width+'px';await wait(70);assert(d.documentElement.scrollWidth<=w.innerWidth+1,'Child overflow at '+width);}
    frame.style.width='100%';pass('Current-story content, controls and parent handle fit 320, 390, 768 and 1200px');
    const exit=d.getElementById('child-exit');exit.dispatchEvent(new w.KeyboardEvent('keydown',{key:' ',repeat:false,cancelable:true}));await wait(500);exit.dispatchEvent(new w.KeyboardEvent('keyup',{key:' ',cancelable:true}));await wait(1700);
    assert(d.body.classList.contains('child-active'),'Short two-second hold escaped');await holdExit(2);pass('The two-second hold rejects an incomplete press and completes a deliberate parent exit');
    let exported=null;const createURL=w.URL.createObjectURL.bind(w.URL),anchorClick=w.HTMLAnchorElement.prototype.click;
    w.URL.createObjectURL=blob=>{if(blob.type==='application/json')exported=blob;return createURL(blob);};w.HTMLAnchorElement.prototype.click=function(){};
    d.getElementById('backup-export').click();await until(()=>exported,'backup JSON');
    w.URL.createObjectURL=createURL;w.HTMLAnchorElement.prototype.click=anchorClick;
    const backup=JSON.parse(await exported.text());w.StoryCore.validateBackup(backup);const row=backup.stories.find(s=>s.id===storyId);
    assert(row.image?.data&&row.audio&&backup.options.exitHoldSeconds===2,'Backup omitted picture/audio/preferences');
    row.title='Restored quiet story';fileInput('backup-file',new w.File([JSON.stringify(backup)],'fixture.storytouch.json',{type:'application/json'}));await until(()=>d.getElementById('confirm-dialog').open,'restore confirmation');d.getElementById('confirm-yes').click();
    await until(async()=> (await w.StoryStore.all('stories')).find(s=>s.id===storyId)?.title===row.title,'restore completed');
    const restored=(await w.StoryStore.all('stories')).find(s=>s.id===storyId);assert(restored.image?.size===picture.size&&restored.blob.size===source.blob.size,'Backup changed picture or audio bytes');
    assert((await w.StoryStore.all('links')).some(l=>l.storyId===storyId),'Restore lost tag link');pass('Backup and restore preserve picture bytes, audio bytes, tag links and parent-handle preferences');
    output.textContent+='\nALL SIMPLIFIED APP CHECKS PASSED\n';document.getElementById('real-fullscreen').disabled=false;
  }catch(error){output.textContent+='\nFAIL '+error.stack+'\n';}finally{document.getElementById('run-child').disabled=false;}
};
document.getElementById('real-fullscreen').onclick=async()=>{
  try {
    d.getElementById('child-screen-black').click();d.getElementById('mode-button').click();
    await until(()=>d.fullscreenElement===d.documentElement,'actual fullscreen');await wait(8000);await d.exitFullscreen();
    assert(d.body.classList.contains('child-active'),'Browser fullscreen exit unlocked the app');await holdExit(2);
    pass('Actual browser fullscreen and a parent handle that stays locked after fullscreen exit');output.textContent+='ALL IMMERSIVE CHECKS PASSED\n';
  }catch(error){output.textContent+='\nFAIL '+error.stack+'\n';}
};
