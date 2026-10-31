/* Prepline Section 1 UI: upload work order -> editable allocation -> print / xlsx. Self-contained; touches nothing else in Prepline. */
(function(){
'use strict';
const E=window.AllocEngine, X=window.XLSX;
const KEY='prepline.alloc.v2', SKEY='prepline.alloc.settings.v1';
const $=id=>document.getElementById(id);
const DAYCAP=d=>d[0].toUpperCase()+d.slice(1);
const WIDTHS=[36.4,15.4,18.1,17.4,25.4,35.1,9.4,6.4,9];
let state=null, settings=loadSettings(), saveTimer=null;

function loadSettings(){try{return Object.assign({},E.DEFAULT_ALLOC_SETTINGS,JSON.parse(localStorage.getItem(SKEY)||'{}'));}catch(e){return Object.assign({},E.DEFAULT_ALLOC_SETTINGS);}}
function save(now){clearTimeout(saveTimer);const go=()=>{if(!state)return;state.savedAt=new Date().toISOString();try{localStorage.setItem(KEY,JSON.stringify(state));$('saveState').textContent='· saved '+new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});}catch(e){$('saveState').textContent='· could not save on this device';}};now?go():(saveTimer=setTimeout(go,300));}

/* ---------- work order reading ---------- */
const COLS='ABCDEFGHIJKLMNOPQ'.split('');let rawRows=null,rawMeta=null;
function fillOf(c){const f=c&&c.s&&(c.s.fgColor||c.s.fill&&c.s.fill.fgColor);if(!f||!f.rgb)return null;const p=c.s.patternType||(c.s.fill&&c.s.fill.patternType);if(p&&p!=='solid')return null;return f.rgb;}
function readWO(buf){const wb=X.read(buf,{cellStyles:true,cellDates:false});
 const name=wb.SheetNames.find(n=>/work\s*order/i.test(n))||wb.SheetNames[0];const ws=wb.Sheets[name];const rg=X.utils.decode_range(ws['!ref']);const rows=[];
 for(let r=rg.s.r;r<=rg.e.r;r++){const o={r:r+1};let any=false;COLS.forEach((C,i)=>{const c=ws[C+(r+1)];if(c&&c.v!=null&&c.v!==''){o[C]=c.t==='n'&&C==='A'&&c.w?c.w:c.v;any=true;}});
  if(!any)continue;o.fill=fillOf(ws['H'+(r+1)])||fillOf(ws['F'+(r+1)]);o.fillA=fillOf(ws['A'+(r+1)]);rows.push(o);}
 return rows;}

function generate(rows,meta){const wo=E.parseWorkOrder(rows);if(!wo.days.length)throw new Error('No day headings (e.g. "Monday, 26 October, 2026") found in column A.');
 const res=E.buildAllocation(wo,settings);if(window.AllocRaw)AllocRaw.applyStaff(res);
 state={v:1,woName:meta.name,woSig:meta.sig,woRows:rows,createdAt:new Date().toISOString(),day:0,res:{week:res.week,fileDate:res.fileDate,lastWO:res.lastWO,sheets:res.sheets,skipped:res.skipped,placed:res.trace.length}};
 save(true);render();}

async function onFile(f){if(!f)return;if(!/\.xls[xm]?$/i.test(f.name)){status('That is not an Excel file. Please choose the work order .xlsx.',true);return;}
 if(state&&state.edited&&!confirm('Loading a new work order replaces the current allocation and clears your edits. Continue?'))return;
 status('Reading '+f.name+' …');try{const rows=readWO(await f.arrayBuffer());localStorage.removeItem(KEY);const meta={name:f.name,sig:f.name+'|'+f.size+'|'+f.lastModified};rawRows=null;
  if(window.AllocRaw&&AllocRaw.isRaw(rows)){rawRows=rows;rawMeta=meta;useRawWeek(null);}else{$('weekRow').hidden=true;generate(rows,meta);}}catch(e){console.error(e);status('Could not read this work order: '+e.message,true);}}
function useRawWeek(ws){const n=AllocRaw.normalise(rawRows,ws);const all=AllocRaw.mondays(rawRows);const sel=$('weekSel');
 sel.innerHTML=all.map(m=>`<option value="${m}"${m===n.weekStart?' selected':''}>Week of ${new Date(m+"T00:00").toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short",year:"numeric"})}</option>`).join('');if(!all.includes(n.weekStart))sel.insertAdjacentHTML('afterbegin',`<option value="${n.weekStart}" selected>Week of ${fmtDate(n.weekStart)}</option>`);$('weekRow').hidden=false;
 generate(n.rows,{...rawMeta,raw:true,weekStart:n.weekStart});state.rawNote=`Raw work order export: kept ${n.stats.kept} Larder / combo rows for this week and coloured ${n.stats.coloured} by best guess (${n.stats.dropped} pastry, sauce and other rows left out).`;save(true);render();}
function status(t,bad){const s=$('woStatus');s.textContent=t;s.style.color=bad?'#b00020':'';}

/* ---------- editor ---------- */
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const dayWord=l=>l.dayWord!=null?l.dayWord:(l.date?E.DAYS[new Date(l.date+'T00:00').getDay()]:'');
function fmtDate(iso){return new Date(iso+'T00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});}
function render(){if(!state){$('allocCard').hidden=true;$('reviewCard').hidden=true;$('printReview').disabled=true;return;}
 const R=state.res;$('allocCard').hidden=false;$('printReview').disabled=false;$('fname').textContent=E.fileName(R);
 status(`Loaded ${state.woName}: ${R.placed} rows placed, ${R.skipped.length} not placed. Week ${fmtShort(R.week[0])} – ${fmtShort(R.week[6])}.`+(state.rawNote?' '+state.rawNote:''));
 $('tabs').innerHTML=R.sheets.map((s,i)=>`<button data-i="${i}" class="${i===state.day?'on':''}" role="tab">${DAYCAP(s.dayName).slice(0,3)}</button>`).join('');
 renderDay();renderReview();}
function fmtShort(iso){const[y,m,d]=iso.split('-');return d+'.'+m+'.'+y.slice(2);}
function cell(path,val,cls){return `<td class="${cls||''}"><div contenteditable="true" data-p="${path}" spellcheck="false">${esc(val)}</div></td>`;}
const COLOPTS=[['','No colour'],['C9DAF8','Sandwich'],['B6D7A8','Salad'],['D9EAD3','Green room / lunchbox'],['70AD47','Platters'],['FFC000','Fruit'],['D5A6BD','Kiosk'],['F4CCCC','Canapé'],['FFFF00','Entrée']];
function lineRow(base,l,i){const p=base+'.'+i;const cl=[l.flag?'flagged':'',l.manual?'manual':''].filter(Boolean).join(' ');return `<tr data-row="${base}" data-i="${i}"${cl?` class="${cl}"`:''}${l.manual?' title="Added by hand"':''}>${cell(p+'.dish',l.dish,l.fill?'cy':'').replace('<div',`<span class="grip" data-grip="${base}" data-i="${i}" title="Drag to move (drop on a day tab to move to that day)" aria-label="Drag to move">⠿</span><div`)}${cell(p+'.paxValue',l.paxValue,'c')}${cell(p+'.dayWord',dayWord(l),'c')}${cell(p+'.staff',l.staff,'c')}${cell(p+'.notes',l.notes)}${cell(p+'.alloc',l.alloc)}<td class="c nowrap"><select class="colSel" data-col="${base}" data-i="${i}" title="Colour / category" aria-label="Colour / category" style="background:#${l.fill||'fff'}">${COLOPTS.map(([c,n])=>`<option value="${c}"${(l.fill||'')===c?' selected':''}>${n}</option>`).join('')}</select><button class="mini" data-del="${base}" data-i="${i}" title="Remove line" aria-label="Remove line">×</button></td></tr>`;}
function renderDay(){const s=state.res.sheets[state.day];const d=state.day;let h=`<div class="sheetwrap"><table class="ed"><colgroup><col style="width:30%"><col style="width:11%"><col style="width:12%"><col style="width:10%"><col style="width:16%"><col style="width:17%"><col style="width:4%"></colgroup>`;
 h+=`<tr><td colspan="7" class="datehead">${esc(fmtDate(s.date))}</td></tr><tr><th>Dishes</th><th>No. of pax</th><th>Date of Function</th><th>Staff Required</th><th>Notes</th><th>allocated Staff</th><th></th></tr>`;
 h+=`<tr><td colspan="7" class="black">Service</td></tr>`;
 s.service.forEach((sec,k)=>{const b=`${d}.service.${k}`;h+=`<tr data-sec="${b}"><td colspan="6" class="sec" style="background:#${sec.fill}"><span contenteditable="true" spellcheck="false" data-secname="${b}" data-f="key">${esc(sec.key)}</span></td><td class="c"><button class="mini" data-add="${b}" title="Add line">+</button></td></tr>`;sec.lines.forEach((l,i)=>h+=lineRow(b,l,i));h+=`<tr class="addrow"><td colspan="7"><button class="addline" data-add="${b}" aria-label="Add a line to this section">+ Add line</button></td></tr>`;});
 h+=`<tr><td colspan="7" class="black">Prep <span style="font-weight:400;font-size:12px">(for ${s.aheadDates.map(x=>DAYCAP(E.DAYS[new Date(x+'T00:00').getDay()])).join(', ')})</span></td></tr>`;
 s.prep.forEach((sec,k)=>{const b=`${d}.prep.${k}`;const m=sec.matrix.map((mm,i)=>`<label>${esc(mm[1])} <input type="number" min="0" inputmode="numeric" data-count="${b}" data-i="${i}" value="${esc((sec.counts||[])[i])}"></label>`).join(' ');
  h+=`<tr data-sec="${b}"><td colspan="6" class="sec" style="background:#${sec.fill}"><span contenteditable="true" spellcheck="false" data-secname="${b}" data-f="title">${esc(sec.title)}</span> <span class="matrix">· staff ${m}</span></td><td class="c"><button class="mini" data-add="${b}" title="Add line">+</button></td></tr>`;sec.lines.forEach((l,i)=>h+=lineRow(b,l,i));h+=`<tr class="addrow"><td colspan="7"><button class="addline" data-add="${b}" aria-label="Add a line to this section">+ Add line</button></td></tr>`;});
 const T=E.chefTotals(s);h+=`<tr class="totrow"><td class="tot">Total chefs needed <span class="totnote">(Staff Required, service + prep lines)</span></td><td></td><td></td><td class="c tot" id="chefTotal">${T.lines}</td><td colspan="3"></td></tr><tr class="totrow"><td class="tot">Prep matrix staff <span class="totnote">(am / lunchbox / pm boxes, counted separately)</span></td><td></td><td></td><td class="c tot" id="prepTotal">${T.prep}</td><td colspan="3"></td></tr>`;
 h+='</table></div>';$('editor').innerHTML=h;}
function updTotals(){if(!state)return;const T=E.chefTotals(state.res.sheets[state.day]);const a=$('chefTotal'),b=$('prepTotal');if(a)a.textContent=T.lines;if(b)b.textContent=T.prep;}
function at(path){const p=path.split('.');let o=state.res.sheets[+p[0]][p[1]][+p[2]];return o;}
function renderReview(){const R=state.res;$('reviewCard').hidden=false;const fl=[];for(const sh of R.sheets)for(const blk of ['service','prep'])for(const sec of sh[blk])for(const l of sec.lines)if(l.flag)fl.push(`<tr><td>${DAYCAP(sh.dayName).slice(0,3)} ${blk}</td><td>${esc(l.dish)}</td><td>⚑ ${esc(l.flag)}</td></tr>`);
 $('review').innerHTML=(fl.length?`<h3>Best guesses to confirm (${fl.length})</h3><table><tr><th>Sheet</th><th>Line</th><th>Flag</th></tr>${fl.join('')}</table><h3>Unplaced rows (${R.skipped.length})</h3>`:'')+(R.skipped.length?`<table><tr><th>WO row</th><th>Item</th><th>Why not placed</th></tr>${R.skipped.map(x=>`<tr><td>${x.r}</td><td>${esc(x.item)}</td><td>${esc(x.why)}</td></tr>`).join('')}</table>`:'<p>Every work order row was placed.</p>');}

/* ---------- print (built from the same layout as the xlsx) ---------- */
function grid(sh){const L=E.sheetLayout(sh);const g={};for(const [r,c,v,st] of L.cells){g[r+','+c]={v,st};}return {L,g};}
function evalF(g,v,depth){if(typeof v!=='string'||v[0]!=='='||depth>8)return v;const ex=v.slice(1).replace(/([A-I])(\d+)/g,(m,C,R)=>{const x=g[(R-1)+','+(C.charCodeAt(0)-65)];const val=x?evalF(g,x.v,depth+1):0;const n=Number(val);return isNaN(n)||val===''?0:n;});
 if(!/^[\d+\-*. ()]+$/.test(ex))return v;try{return Function('return ('+ex+')')();}catch(e){return v;}}
function printSheetHTML(sh){const {L,g}=grid(sh);const merged=new Set();const spans={};for(const [r0,c0,r1,c1] of L.merges){spans[r0+','+c0]=c1-c0+1;for(let c=c0+1;c<=c1;c++)merged.add(r0+','+c);}
 const tw=WIDTHS.reduce((a,b)=>a+b,0);let h=`<section class="psheet"><table class="pt"><colgroup>${WIDTHS.map(w=>`<col style="width:${(w/tw*100).toFixed(2)}%">`).join('')}</colgroup>`;
 for(let r=0;r<L.rows;r++){h+='<tr>';for(let c=0;c<9;c++){const k=r+','+c;if(merged.has(k))continue;const x=g[k];const sp=spans[k]?` colspan="${spans[k]}"`:'';
  if(!x){h+=`<td class="${c<6?'':'nb'}"${sp}></td>`;continue;}let v=x.v,st=x.st,css='',cls=[];
  if(st==='date')v=fmtDate(sh.date);if(typeof v==='string'&&v[0]==='=')v=evalF(g,v,0);
  if(st==='black'){css='background:#000;color:#fff';cls.push('b');}if(st.startsWith('sec:'))css='background:#'+st.slice(4);if(st.startsWith('dish:'))css='background:#'+st.slice(5);if(st==='head'||st==='date'||st==='title')cls.push('b','c');
  if(['num','center','count'].includes(st))cls.push('c');if(c>=6&&st!=='count'&&st!=='body')cls.push('nb');if(c>=6&&st==='body')cls.push('nb');
  h+=`<td class="${cls.join(' ')}" style="${css}"${sp}>${esc(v)}</td>`;}h+='</tr>';}
 return h+'</table></section>';}
function doPrint(which){if(!state)return;const R=state.res;const list=which==='week'?R.sheets:[R.sheets[state.day]];$('printArea').innerHTML=list.map(printSheetHTML).join('');document.title=E.fileName(R).replace(/\.xlsx$/,'')+(which==='week'?'':' '+DAYCAP(list[0].dayName));window.print();}
function printReview(){if(!state)return;const R=state.res;$('printArea').innerHTML=`<section class="psheet"><h2>Work order review · ${esc(state.woName)}</h2>${$('review').innerHTML}</section>`;window.print();}

/* ---------- xlsx in Paula's template layout ---------- */
const thin={style:'thin',color:{rgb:'000000'}};const B={top:thin,bottom:thin,left:thin,right:thin};
function styleFor(st,c){const s={font:{name:'Arial',sz:10,color:{rgb:'000000'}},alignment:{vertical:'bottom',wrapText:false}};
 if(c<6)s.border=B;
 if(st==='title'||st==='date'||st==='head'){s.font={name:'Calibri',sz:11,bold:true};s.alignment.horizontal='center';}
 if(st==='black'){s.font={name:'Calibri',sz:11,bold:true,color:{rgb:'FFFFFFFF'}};s.fill={patternType:'solid',fgColor:{rgb:'000000'}};}
 if(st.startsWith('sec:')){s.font={name:'Calibri',sz:11};s.fill={patternType:'solid',fgColor:{rgb:st.slice(4)}};}
 if(['num','center','count'].includes(st))s.alignment.horizontal='center';
 if(st.startsWith('dish:'))s.fill={patternType:'solid',fgColor:{rgb:st.slice(5)}};
 if(st==='foot')s.font={name:'Calibri',sz:11,bold:true};return s;}
function serial(iso){const[y,m,d]=iso.split('-').map(Number);return (Date.UTC(y,m-1,d)-Date.UTC(1899,11,30))/864e5;}
function buildWorkbook(){const R=state.res;const wb=X.utils.book_new();
 for(const sh of R.sheets){const L=E.sheetLayout(sh);const ws={};let maxR=0;
  for(const [r,c,v,st] of L.cells){const a=X.utils.encode_cell({r,c});let cell;
   if(st==='date')cell={t:'n',v:serial(sh.date),z:'dddd", "mmmm" "d", "yyyy'};
   else if(typeof v==='string'&&/^=/.test(v)&&v.length>1)cell={t:'n',f:v.slice(1)};
   else if(typeof v==='number')cell={t:'n',v};
   else if(v!==''&&v!=null&&!isNaN(Number(v))&&/^\s*\d+(\.\d+)?\s*$/.test(String(v)))cell={t:'n',v:Number(v)};
   else cell={t:'s',v:v==null?'':String(v)};
   cell.s=styleFor(st,c);ws[a]=cell;maxR=Math.max(maxR,r);}
  ws['!ref']=X.utils.encode_range({s:{r:0,c:0},e:{r:maxR,c:8}});ws['!merges']=L.merges.map(([r0,c0,r1,c1])=>({s:{r:r0,c:c0},e:{r:r1,c:c1}}));
  ws['!cols']=WIDTHS.map(w=>({width:w}));ws['!margins']={left:.25,right:.25,top:.25,bottom:.25,header:0,footer:0};
  ws['!rows']=Array.from({length:maxR+1},()=>({hpt:15.75}));X.utils.book_append_sheet(wb,ws,DAYCAP(sh.dayName));}
 {const fl=[];for(const sh of R.sheets)for(const blk of ['service','prep'])for(const sec of sh[blk])for(const l of sec.lines)if(l.flag)fl.push([DAYCAP(sh.dayName),blk,sec.key||sec.title,l.dish,'⚑ '+l.flag]);
  const aoa=[['WO row','Item','Why not placed']].concat((R.skipped||[]).map(x=>[x.r,x.item,x.why]),[[],['Day','Block','Section','Line','Flag (best guess — confirm)']],fl);
  const ws=X.utils.aoa_to_sheet(aoa);ws['!cols']=[{width:10},{width:50},{width:60},{width:40},{width:80}];X.utils.book_append_sheet(wb,ws,'Unplaced');}
 return wb;}
function download(){const wb=buildWorkbook();X.writeFile(wb,E.fileName(state.res),{bookType:'xlsx',cellStyles:true});}

/* ---------- settings ---------- */
function fillSettings(){$('setFileDate').value=settings.fileDateRule;$('setAhead').value=settings.prepDaysAhead;$('setRound').value=settings.roundTo;$('setCut').value=settings.cutawayHandling;$('setJson').value=JSON.stringify(settings,null,1);}
function applySettings(reset){let s;try{s=reset?Object.assign({},E.DEFAULT_ALLOC_SETTINGS):Object.assign({},E.DEFAULT_ALLOC_SETTINGS,JSON.parse($('setJson').value));}catch(e){alert('Advanced settings are not valid JSON: '+e.message);return;}
 if(!reset){s.fileDateRule=$('setFileDate').value;s.prepDaysAhead=Math.max(1,+$('setAhead').value||2);s.roundTo=Math.max(0,+$('setRound').value||0);s.cutawayHandling=$('setCut').value;}
 if(state&&state.edited&&!confirm('Rebuilding with new settings clears your edits. Continue?'))return;
 settings=s;localStorage.setItem(SKEY,JSON.stringify(s));fillSettings();if(state&&state.woRows){const day=state.day;generate(state.woRows,{name:state.woName,sig:state.woSig});state.day=day;save(true);render();}}

/* ---------- wiring ---------- */
const drop=$('drop'),inp=$('woFile');
drop.addEventListener('click',()=>inp.click());drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();inp.click();}});
inp.addEventListener('change',()=>{onFile(inp.files[0]);inp.value='';});
$('weekSel').addEventListener('change',e=>{if(rawRows){if(state&&state.edited&&!confirm('Changing the week rebuilds the allocation and clears your edits. Continue?'))return;useRawWeek(e.target.value);}else status('Upload the work order again to change the week.',true);});
['dragenter','dragover'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add('over');}));
['dragleave','drop'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove('over');}));
drop.addEventListener('drop',e=>onFile(e.dataTransfer.files[0]));
$('tabs').addEventListener('click',e=>{const b=e.target.closest('button[data-i]');if(!b)return;state.day=+b.dataset.i;save(true);render();});
$('editor').addEventListener('input',e=>{const t=e.target;if(t.dataset.p){const p=t.dataset.p.split('.');const field=p.pop();const line=at(p.slice(0,3).join('.')).lines[+p[3]];let v=t.innerText.replace(/\n+$/,'');
  if(field==='paxValue'&&/^\s*\d+(\.\d+)?\s*$/.test(v))v=Number(v);line[field]=v===''&&field==='paxValue'?null:v;state.edited=true;save();if(field==='staff')updTotals();}
 else if(t.dataset.secname){at(t.dataset.secname)[t.dataset.f]=t.innerText.trim();state.edited=true;save();}
 else if(t.dataset.count){at(t.dataset.count).counts[+t.dataset.i]=t.value;state.edited=true;save();updTotals();}});
$('editor').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.target.dataset.secname||e.target.dataset.p&&e.target.dataset.p.slice(-5)!=='notes')){e.preventDefault();e.target.blur();}});
$('editor').addEventListener('click',e=>{const a=e.target.closest('[data-add]'),d=e.target.closest('[data-del]');
 if(a||d)snap();
 if(a){at(a.dataset.add).lines.push({dish:'',paxValue:null,dayWord:'',manual:true});state.edited=true;save(true);renderDay();const ed=$('editor').querySelectorAll(`[data-p^="${a.dataset.add}."][data-p$=".dish"]`);ed[ed.length-1].focus();}
 if(d){at(d.dataset.del).lines.splice(+d.dataset.i,1);state.edited=true;save(true);renderDay();}});
$('dlXlsx').onclick=download;$('printDay').onclick=()=>doPrint('day');$('printWeek').onclick=()=>doPrint('week');$('printReview').onclick=printReview;const _ps=$('printStations');if(_ps)_ps.onclick=printStationSheets;
$('clearAlloc').onclick=()=>{if(!confirm('Clear the allocation and all edits from this device?'))return;localStorage.removeItem(KEY);state=null;status('Cleared. Upload a work order to start.');render();};
$('applySettings').onclick=()=>applySettings(false);$('resetSettings').onclick=()=>applySettings(true);
window.addEventListener('beforeprint',()=>{if(state&&!$('printArea').innerHTML)$('printArea').innerHTML=printSheetHTML(state.res.sheets[state.day]);});
window.addEventListener('afterprint',()=>{$('printArea').innerHTML='';});
fillSettings();try{state=JSON.parse(localStorage.getItem(KEY)||'null');}catch(e){state=null;}if(state&&state.v!==1)state=null;render();if(!state)status('No work order loaded yet.');
/* ---------- edit mode: drag & drop (pointer events: mouse, touch, pen), undo, reset ---------- */
let undoStack=[];const UNDO_MAX=50;
function snap(){if(!state)return;undoStack.push(JSON.stringify(state.res.sheets));if(undoStack.length>UNDO_MAX)undoStack.shift();updUndo();}
function updUndo(){const b=$('undoEdit');if(b)b.disabled=!undoStack.length;}
function undo(){if(!undoStack.length||!state)return;state.res.sheets=JSON.parse(undoStack.pop());state.edited=true;save(true);renderDay();updUndo();status('Undone.');}
$('editor').addEventListener('change',e=>{const t=e.target;if(!t.dataset.col)return;snap();const l=at(t.dataset.col).lines[+t.dataset.i];l.fill=t.value||null;state.edited=true;save(true);renderDay();status('Colour changed.');});
$('editor').addEventListener('focusin',e=>{if((e.target.dataset.p||e.target.dataset.secname)&&!e.target.dataset.snapped){e.target.dataset.snapped='1';snap();}});
$('undoEdit').onclick=undo;
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!e.shiftKey&&!(e.target.isContentEditable||/INPUT|TEXTAREA/.test(e.target.tagName))){e.preventDefault();undo();}});
$('resetAuto').onclick=()=>{if(!state)return;if(state.edited&&!confirm('Throw away all edits and rebuild this week automatically from the work order?'))return;
 const day=state.day,note=state.rawNote;snap();generate(state.woRows,{name:state.woName,sig:state.woSig});state.day=day;state.rawNote=note;state.edited=false;save(true);render();status('Reset to the automatic allocation.');};
let drag=null;
function moveLine(src,dst){// src {base,i}; dst {base,i(insert index)}
 const from=at(src.base).lines;const [l]=from.splice(src.i,1);if(!l)return;let i=dst.i;if(src.base===dst.base&&src.i<i)i--;const to=at(dst.base).lines;to.splice(Math.max(0,Math.min(i,to.length)),0,l);l.moved=true;}
function sameSecOnDay(base,day){const [d,blk,k]=base.split('.');const sh=state.res.sheets[day];const srcSec=state.res.sheets[+d][blk][+k];const key=srcSec.key;let j=sh[blk].findIndex(x=>x.key===key);if(j<0)j=0;return day+'.'+blk+'.'+j;}
function targetAt(x,y){const el=document.elementFromPoint(x,y);if(!el)return null;const tab=el.closest('#tabs button[data-i]');if(tab)return {tab:+tab.dataset.i,el:tab};
 const row=el.closest('tr[data-row]');if(row){const r=row.getBoundingClientRect();return {base:row.dataset.row,i:+row.dataset.i+(y>r.top+r.height/2?1:0),el:row,after:y>r.top+r.height/2};}
 const sec=el.closest('tr[data-sec]');if(sec)return {base:sec.dataset.sec,i:0,el:sec,after:true};return null;}
function clearMarks(){document.querySelectorAll('.dropB,.dropA,.dropTab').forEach(n=>n.classList.remove('dropB','dropA','dropTab'));}
$('editor').addEventListener('pointerdown',e=>{const g=e.target.closest('.grip');if(!g||!state)return;e.preventDefault();
 const row=g.closest('tr');const ghost=document.createElement('div');ghost.className='dragGhost noprint';ghost.textContent=at(g.dataset.grip).lines[+g.dataset.i].dish||'(blank line)';document.body.appendChild(ghost);
 drag={src:{base:g.dataset.grip,i:+g.dataset.i},ghost,pid:e.pointerId,tabTimer:null,tabOver:null};row.classList.add('dragging');document.body.classList.add('isDragging');
 g.setPointerCapture&&g.setPointerCapture(e.pointerId);placeGhost(e);});
function placeGhost(e){drag.ghost.style.left=(e.clientX+12)+'px';drag.ghost.style.top=(e.clientY+12)+'px';}
function onMove(e){if(!drag||e.pointerId!==drag.pid)return;e.preventDefault();placeGhost(e);clearMarks();const t=targetAt(e.clientX,e.clientY);drag.t=t;
 if(t&&t.tab!=null){t.el.classList.add('dropTab');if(drag.tabOver!==t.tab){clearTimeout(drag.tabTimer);drag.tabOver=t.tab;drag.tabTimer=setTimeout(()=>{if(drag&&drag.tabOver===t.tab&&state.day!==t.tab){// switch day mid-drag; the dragged line moves with you
   const dst=sameSecOnDay(drag.src.base,t.tab);moveLine(drag.src,{base:dst,i:at(dst).lines.length});drag.src={base:dst,i:at(dst).lines.length-1};state.day=t.tab;render();drag.switched=true;}},450);}}
 else{clearTimeout(drag.tabTimer);drag.tabOver=null;if(t)t.el.classList.add(t.after?'dropA':'dropB');}
 const r=$('editor').getBoundingClientRect();if(e.clientY<60)window.scrollBy(0,-12);else if(e.clientY>innerHeight-60)window.scrollBy(0,12);}
function onUp(e){if(!drag||e.pointerId!==drag.pid)return;clearTimeout(drag.tabTimer);const t=drag.t;const d=drag;drag=null;d.ghost.remove();clearMarks();document.body.classList.remove('isDragging');
 if(t&&t.tab!=null&&t.tab!==state.day){const dst=sameSecOnDay(d.src.base,t.tab);moveLine(d.src,{base:dst,i:at(dst).lines.length});state.day=t.tab;}
 else if(t&&t.base&&!(t.base===d.src.base&&(t.i===d.src.i||t.i===d.src.i+1))){moveLine(d.src,{base:t.base,i:t.i});}
 else if(!d.switched){renderDay();return;}
 state.edited=true;save(true);render();status('Moved.');}
$('editor').addEventListener('pointerdown',()=>{},{passive:false});
document.addEventListener('pointerdown',e=>{if(e.target.closest&&e.target.closest('.grip'))snap();},true);
document.addEventListener('pointermove',onMove,{passive:false});document.addEventListener('pointerup',onUp);document.addEventListener('pointercancel',e=>{if(drag&&e.pointerId===drag.pid){drag.t=null;onUp(e);}});
updUndo();
$('editor').addEventListener('focusout',()=>{if(state)save(true);});addEventListener('pagehide',()=>{if(state)save(true);});

function printStationSheets(){
  if(!state)return;
  if(!window.PreplineUpgrades47){alert('Station sheets module missing');return;}
  const sheets=PreplineUpgrades47.buildStationSheetsFromAlloc(state);
  if(!sheets.length){alert('No allocated lines yet — assign staff in the Allocated Staff column first.');return;}
  PreplineUpgrades47.ensureCss();
  $('printArea').innerHTML=PreplineUpgrades47.stationSheetHtml(sheets,{escapeHtml:esc});
  document.title=(E.fileName(state.res)||'Prepline').replace(/\.xlsx$/,'')+' · station sheets';
  window.print();
}
window.__alloc={get state(){return state;},buildWorkbook,printSheetHTML,printStationSheets};
})();
