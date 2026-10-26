/* Prepline Section 1: Work orders -> Larder allocation. Pure engine (browser + Node). No real data in here. */
(function(root){
const DAYS=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const DEFAULT_ALLOC_SETTINGS={
 prepDaysAhead:2,               // Prep on day D lists functions on D+1..D+N  (OPEN QUESTION: 2 vs 3)
 extraAhead:{friday:3,saturday:3}, // Fri also covers Mon (D+3), Sat also covers Tue (D+3)
 fileDateRule:'lastWorkOrderDate', // 'lastWorkOrderDate' | 'weekSunday'  -> "Larder W.E DD.MM.YY.xlsx" (OPEN QUESTION)
 colourToSection:{C9DAF8:'Sandwich',B6D7A8:'Salad',D9EAD3:'Salad','70AD47':'Salad',F4CCCC:'Canape',FFC000:'Fruits',D5A6BD:'Retail',FFFF00:'Salad',FF0000:'Salad'},
 cutawayColour:'9E61E8', cutawayHandling:'section-by-row-colour', // or 'skip'
 entCentre:{roomPattern:'ent cent|entertainment centre|tiktok',eventPattern:'american express|amex',greenRoomLine:'{artist} green room',retailLine:'{artist} kiosk & amex'},
 genericItemPattern:'asn menu|generic menu item|custom sydney eats',
 roundTo:0,                     // 0 = no rounding of pax (OPEN QUESTION: Paula rounds by judgement)
 coffeeShopLines:[],            // generic coffee shop lines [{dish,pax,day}] (OPEN QUESTION)
 fruitsFirstLine:'botanicals',
 shortNamePrefixes:['Wrap - ','Sandwich - ','Salad - ','Bowl - ','Custom Menu - ']
};
const SERVICE_SECTIONS=['Sandwich','Salad','Canape'];
const PREP_SECTIONS=[
 {key:'Sandwich',title:'Sandwich / Coffee shop & Sandwich bar',fill:'00B0F0',matrix:[['Sandwich','am'],[null,'lunchbox'],[null,'PM']]},
 {key:'Salad',title:'Salad / Team Cafe',fill:'92D050',matrix:[['Salad','am'],[null,'lunchbox'],[null,'pm']]},
 {key:'Canape',title:'Canape',fill:'FF6699',matrix:[['Canape','am'],[null,'pm']]},
 {key:'Fruits',title:'Fruits',fill:'FFC000',matrix:[['Fruits','am'],[null,'pm']]},
 {key:'Retail',title:'Retail',fill:'F2F2F2',matrix:[['Retail','am'],[null,'PM']]},
 {key:'Coffee',title:'coffee shop',fill:'C59EE2',matrix:[['coffee shop','am'],['closing down','PM']]}];
const SERVICE_FILL={Sandwich:'00B0F0',Salad:'92D050',Canape:'FF6699'};
const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const addDays=(s,n)=>{const d=new Date(s+'T00:00');d.setDate(d.getDate()+n);return iso(d);};
const dow=s=>new Date(s+'T00:00').getDay();
const hex=c=>c?String(c).toUpperCase().replace(/^#/,'').replace(/^FF(?=[0-9A-F]{6}$)/,''):null;
const clean=v=>v==null?'':String(v).replace(/\u00a0/g,' ').trim();
const DAYRE=/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+(\d{1,2})\s+([a-z]+),?\s+(\d{4})/i;
function parseDay(t){const m=clean(t).match(DAYRE);if(!m)return null;const d=new Date(m[2]+' '+m[3]+' '+m[4]);return isNaN(d)?null:iso(d);}
function shortName(t,S){t=clean(t).split('\n')[0];for(const p of S.shortNamePrefixes)if(t.toLowerCase().startsWith(p.toLowerCase()))t=t.slice(p.length);
 {const seg=t.split(',');t=seg[0].trim().split(/\s+/).length<2&&seg[1]?seg[0]+' '+seg[1].trim():seg[0];}t=t.replace(/\((serves|pfd)[^)]*\)/ig,'').replace(/\s+\b(GF|VE|V|DF|LC|contains .*)(\s+(GF|VE|V|DF|LC))*\s*$/,'').trim();return t.toLowerCase();}
function notesDishes(n,S){const out=[];for(let t of String(n||'').split('\n')){t=t.replace(/^["'\-\s]+|["'\s]+$/g,'');if(!t)continue;
  if(/^(salad|sandwich|wraps?|cold|hot|dessert|dietar(y|ies)|menu)\b[\s:\-]*(\d+\s*\w+)?$/i.test(t))continue;if(/intoleran|allerg|pescatarian|^\d*\s*x?\s*(vegan|vegetarian|gluten free|halal|coeliac)\b|^\d+\s*x\s*\w+$/i.test(t))continue;if(/^\d+\s*(zuma|handbowls?|big bowls?|hanbowls?)\b/i.test(t)||/^\d+\s*x\s/i.test(t)&&t.length<20)continue;
  t=t.replace(/^\d+\s*(-|x|boxes?|pcs)?\s*'?/i,'').replace(/\s+x\s*\d+\s*$/i,'');const nm=shortName(t,S);if(nm&&nm.length>2&&!out.includes(nm))out.push(nm);}return out;}
/* rows: [{r, A..O (values), fillA, fill (of H/F)}] */
function parseWorkOrder(rows){let day=null,ev='',evNo='',out=[];const days=[];
 for(const x of rows){const a=clean(x.A);const pd=parseDay(a);if(pd){day=pd;days.push(pd);continue;}
  if(clean(x.B)&&!clean(x.C)&&!clean(x.F)){evNo=clean(x.B);continue;}
  if(clean(x.C)&&!clean(x.F)){ev=clean(x.C);continue;}
  if(day&&clean(x.F)&&clean(x.H))out.push({r:x.r,date:day,event:ev,eventNo:evNo,room:clean(x.F),qty:Number(x.G)||0,qtyRaw:clean(x.G),item:clean(x.H),notes:x.I==null?'':String(x.I),colour:hex(x.fill),colA:hex(x.fillA)});}
 return {lines:out,days:[...new Set(days)].sort()};}
function buildAllocation(wo,S0){const S=Object.assign({},DEFAULT_ALLOC_SETTINGS,S0||{});const roomRe=new RegExp(S.entCentre.roomPattern,'i'),evRe=new RegExp(S.entCentre.eventPattern,'i');
 const L=wo.lines;const items=[];const trace=[];const skipped=[];
 // parents (uncoloured rows give pax)
 const parent={};const lastCol={};
 // Ent centre artists per date
 const artists={};for(const l of L){if(roomRe.test(l.room)&&!/kiosk|tiktok|south/i.test(l.room)||(/green room/i.test(l.room))){(artists[l.date]=artists[l.date]||new Set()).add(l.event.split('|').pop().trim());}}
 const isEnt=l=>roomRe.test(l.room)||evRe.test(l.event);
 const artistOf=l=>{const a=l.event.split('|').pop().trim();if(artists[l.date]&&artists[l.date].has(a))return a;const s=[...(artists[l.date]||[])];return s.length===1?s[0]:a;};
 const add=(o,src)=>{items.push(o);trace.push({...o,woRow:src.r});};
 const done=new Set();
 for(const l of L){const k=l.event+'|'+l.room+'|'+l.date;
  if(!l.colour){if(l.qty>1)parent[k]=l;skipped.push({r:l.r,why:'uncoloured (header / not Larder)',item:l.item});continue;}
  if(l.colA===S.cutawayColour&&S.cutawayHandling==='skip'){skipped.push({r:l.r,why:'cutaway (skipped by setting)',item:l.item});continue;}
  let sec=S.colourToSection[l.colour];if(!sec){skipped.push({r:l.r,why:'colour '+l.colour+' not in legend',item:l.item});continue;}
  const cut=l.colA===S.cutawayColour?' (cutaway)':'';
  if(isEnt(l)&&sec!=='Canape'){const a=artistOf(l);
   if(sec==='Retail'||evRe.test(l.event)){const key='R|'+l.date+'|'+a.toLowerCase();if(!done.has(key)){done.add(key);add({section:'Retail',date:l.date,dish:S.entCentre.retailLine.replace('{artist}',a),pax:null,kind:'ent'},l);}}
   else {const key='G|'+l.date+'|'+a.toLowerCase();if(!done.has(key)){done.add(key);add({section:'Salad',date:l.date,dish:S.entCentre.greenRoomLine.replace('{artist}',a),pax:null,kind:'ent'},l);}}
   continue;}
  if(sec==='Retail'){const nm=(l.event.replace(/\(.*?\)/g,'').replace(/\b20\d\d\b/g,'').trim().split(/\s+/).slice(0,3).join(' ')+' kiosk').toLowerCase();const key='K|'+l.date+'|'+nm;if(!done.has(key)){done.add(key);add({section:'Retail',date:l.date,dish:nm,pax:null,kind:'kiosk'},l);}continue;}
  const lc=lastCol[k];let inherited=null;
  if(l.qty<=1&&lc&&lc.qty>1&&lc.colour===l.colour){if(/bag|box/i.test(lc.item)){skipped.push({r:l.r,why:'component of '+lc.item,item:l.item});continue;}
   inherited=lc.qty;if(lc._idx!=null&&!lc._dropped){items[lc._idx].drop=true;trace[lc._idx].drop=true;lc._dropped=true;skipped.push({r:lc.r,why:'package header: pax passed to its dishes',item:lc.item});}}
  else lastCol[k]=l;
  const gen=new RegExp(S.genericItemPattern,'i').test(l.item);
  if(/juice flavour|juicer|^kale, spinach/i.test(l.item)){skipped.push({r:l.r,why:'juice station component',item:l.item});continue;}
  const P=v=>S.roundTo>0?Math.round(v/S.roundTo)*S.roundTo:v;
  if(sec==='Canape'){const ns=notesDishes(l.notes,S);const dish=((gen||/canap|green room|party/i.test(l.item))&&ns.length?ns.slice(0,4).join(' / '):shortName(l.item,S));l._idx=items.length;add({section:sec,date:l.date,dish:dish+cut,pax:P(l.qty||1),kind:'canape'},l);continue;}
  if(gen){const ns=notesDishes(l.notes,S);for(const d of (ns.length?ns:[shortName(l.item,S)]))add({section:sec,date:l.date,dish:d+cut,pax:P(l.qty),kind:'dish'},l);continue;}
  let dish=shortName(l.item,S),pax,kind='dish';
  if(/juice station/i.test(l.item)){pax=1;kind='count';}
  else if(/platter/i.test(l.item)&&!(l.qty<=1&&parent[k])&&inherited==null){pax=l.qty||l.qtyRaw;kind=typeof pax==='number'?'count':'dish';}
  else {pax=inherited!=null?inherited:(l.qty<=1&&parent[k])?parent[k].qty:(l.qty||l.qtyRaw);if(typeof pax==='number')pax=P(pax);}
  l._idx=items.length;add({section:sec,date:l.date,dish:dish+cut,pax,kind},l);}
 for(let i=items.length-1;i>=0;i--)if(items[i].drop){items.splice(i,1);}
 // aggregate per section/date/dish
 const agg=new Map();for(const it of items){const key=it.section+'|'+it.date+'|'+it.dish;const g=agg.get(key);if(g){if(it.pax!=null)g.parts.push(it.pax);}else agg.set(key,{...it,parts:it.pax!=null?[it.pax]:[]});}
 const lines=[...agg.values()].map(g=>{const num=g.parts.every(x=>typeof x==='number');const p=g.kind==='count'&&num?[g.parts.reduce((a,b)=>a+b,0)]:num?g.parts:[g.parts.join(' + ')];return {...g,paxValue:p.length===0?null:p.length===1?p[0]:'='+p.join('+'),paxTotal:num?p.reduce((a,b)=>a+b,0):null};});
 for(const c of S.coffeeShopLines||[])lines.push({section:'Coffee',date:c.date||null,dayWord:c.day,dish:c.dish,paxValue:c.pax??null,kind:'generic'});
 const first=wo.days[0],monday=addDays(first,-((dow(first)+6)%7));const week=[0,1,2,3,4,5,6].map(i=>addDays(monday,i));
 const lastWO=wo.days[wo.days.length-1];const fileDate=S.fileDateRule==='weekSunday'?week[6]:lastWO;
 const sheets=week.map(D=>{const dn=DAYS[dow(D)];const ahead=[];for(let i=1;i<=S.prepDaysAhead;i++)ahead.push(addDays(D,i));const ex=S.extraAhead[dn];if(ex)for(let i=S.prepDaysAhead+1;i<=ex;i++)ahead.push(addDays(D,i));
  const sel=(sec,dates)=>lines.filter(x=>x.section===sec&&(x.date?dates.includes(x.date):sec==='Coffee')).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  return {date:D,dayName:dn,aheadDates:ahead,service:SERVICE_SECTIONS.map(s=>({key:s,fill:SERVICE_FILL[s],lines:sel(s,[D]).map(x=>({...x}))})),prep:PREP_SECTIONS.map(p=>({...p,counts:p.matrix.map(()=>''),lines:(p.key==='Fruits'&&S.fruitsFirstLine?[{dish:S.fruitsFirstLine,paxValue:null,date:null}]:[]).concat(sel(p.key,ahead).map(x=>({...x})))}))};});
 return {settings:S,week,fileDate,lastWO,sheets,lines,trace,skipped};}
function fileName(res){const [y,m,d]=res.fileDate.split('-');return `Larder W.E ${d}.${m}.${y.slice(2)}.xlsx`;}
/* Build an AOA + style map for one day sheet in Paula's template layout. Returns {cells:[[r,c,v,style]], merges, rows} */
function sheetLayout(sh){const C=[];let r=0;const put=(row,col,v,st)=>C.push([row,col,v,st||'body']);const merges=[];const iRef={};
 put(0,0,'','title');merges.push([0,0,0,5]);put(1,0,new Date(sh.date+'T00:00'),'date');merges.push([1,0,1,5]);
 ['Dishes','No. of pax','Date of Function','Staff Required','Notes','allocated Staff'].forEach((h,i)=>put(2,i,h,'head'));
 r=3;put(r,0,'Service','black');r++;
 for(const s of sh.service){put(r,0,s.key,'sec:'+s.fill);r++;const ls=s.lines.length?s.lines:[null];for(const l of ls){row(l);r++;}r++;}
 put(r,0,'Prep','black');r++;
 for(const p of sh.prep){const start=r;put(r,0,p.title,'sec:'+p.fill);
  p.matrix.forEach((m,i)=>{if(m[0])put(r+i,6,m[0]);put(r+i,7,m[1]);{const cv=(p.counts||[])[i];if(cv!==''&&cv!=null)put(r+i,8,Number(cv)||cv,'count');}iRef[p.key+':'+m[1].toLowerCase()]='I'+(r+i+1);});
  let ls=p.lines.slice();
  r++;for(const l of ls){row(l);r++;}
  const need=start+p.matrix.length;if(r<need)r=need;if(p.key!=='Coffee')r++;}
 function row(l){for(let c=0;c<6;c++)put(r,c,'', 'body');if(!l)return;put(r,0,l.dish,'dish');if(l.paxValue!=null)put(r,1,l.paxValue,'num');put(r,2,l.dayWord||(l.date?DAYS[dow(l.date)]:''),'center');if(l.staff)put(r,3,l.staff,'center');if(l.notes)put(r,4,l.notes,'body');if(l.alloc)put(r,5,l.alloc,'body');}
 const g=k=>iRef[k]||'0';const f=(...ks)=>'='+ks.map(g).join('+');
 const foot=[['AM Staff',f('Sandwich:am','Salad:am','Canape:am','Fruits:am','Retail:am','Coffee:am')],['LUNCHBOX STAFF',f('Sandwich:lunchbox','Salad:lunchbox')],['PM staff',f('Salad:pm','Canape:pm','Fruits:pm','Retail:pm','Coffee:pm','Sandwich:pm')]];
 const fr=r;foot.forEach((x,i)=>{put(r,0,x[0],'foot');put(r,5,x[1],'formula');r++;});put(r,0,'Total staffs','foot');put(r,5,`=F${fr+1}+F${fr+2}+F${fr+3}`,'formula');r++;
 const tr=r;['TOTAL AM','TOTAL PM','TOTAL LUNCHBOX'].forEach(t=>{put(r,4,t,'body');put(r,5,'','body');r++;});r++;
 [['MISSING AM',fr+1,tr+1],['MISSING PM',fr+3,tr+2],['MISSING LUNCHBOX',fr+2,tr+3]].forEach(x=>{put(r,4,x[0],'body');put(r,5,`=F${x[1]}-F${x[2]}`,'formula');r++;});
 return {cells:C,merges,rows:r};}
const API={DEFAULT_ALLOC_SETTINGS,PREP_SECTIONS,SERVICE_SECTIONS,parseWorkOrder,buildAllocation,sheetLayout,fileName,shortName,iso,addDays,DAYS};
root.AllocEngine=API;if(typeof module!=='undefined')module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
