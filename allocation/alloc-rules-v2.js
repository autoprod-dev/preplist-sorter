/* Prepline alloc v2: event-first allocation following Paula's decoded rules (allocation-rules-spec.md). No real data in here. */
(function(root){
const CYAN='00FFFF';
const lc=s=>String(s||'').toLowerCase();
const TAGS=/\s+\b(GF|VE|V|DF|LC|contains .*|\(A\))(\s+(GF|VE|V|DF|LC))*\s*$/i;
function nm(t,keepType){t=String(t||'').split('\n')[0].replace(/^["'\-\s•]+/,'');const ty=(t.match(/^(wrap|sandwich|salad bowl)\s*-/i)||[])[1]||(/\bsalad\b/i.test(t.split(/,| with /i).slice(0,3).join(' '))?'salad':null);t=t.replace(/^(salad bowl|salad|wrap|sandwich|bowl|handbowl|custom menu)\s*-\s*/i,'');
 t=t.replace(/\((serves|pfd|ge|v|gf)[^)]*\)/ig,'');let seg=t.split(/,| with | served | – | - /i);let s=seg[0].trim();if(s.split(/\s+/).length<2&&seg[1])s+=' '+seg[1].trim();else if(ty==='salad'&&seg[1]&&/^,/.test(t.slice(seg[0].length))&&seg[1].trim().split(/\s+/).length<=2)s+=' '+seg[1].trim().replace(/^and\s+/i,'');
 let o=lc(s.replace(TAGS,'').replace(/\s+/g,' ').trim());if(ty&&!new RegExp(ty,'i').test(o))o+=' '+lc(ty);return o;}
const CAN=[[/tofu.*(lettuce|cup|mushroom)/,'tofu lettuce cups'],[/vol.?au.?vent/,'vol au vent'],[/peking duck/,'peking duck'],[/feta.*tart|persian style feta/,'feta tart'],[/taco/,'prawn taco'],[/rock oyster|^\d*\s*merimbula|^oysters?\b/,'oysters'],[/pumpkin.*tart/,'pumpkin tart'],[/miang/,'salmon miang'],[/coyo|compressed cucumber/,'cucumber coyo'],[/bresaola/,'beef bresaola'],[/leek.*tart/,'leek tart'],[/vegemite/,'vegemite on toast'],[/teriyaki sushi/,'chicken teriyaki sushi'],[/tofu nigiri/,'tofu nigiri'],[/sushi.*nigiri|sushi and nigiri/,'sushi and nigiri'],[/tuna tart/,null]];
function canName(t){const s=lc(t);for(const [re,n] of CAN)if(re.test(s))return n;return nm(t).split(' ').slice(0,3).join(' ');}
const SKIP=[[/muesli|energy bar|\(pfd|piece of whole/i,'lunch bag / box filling'],[/rider/i,'rider'],[/promoter/i,'promoter catering'],[/tea ?& ?cof/i,'tea / coffee'],[/^dietary|^dietar/i,'dietary row'],[/^cold items|^hot items/i,'header row'],[/additional canap/i,'canapé station header (party continues)'],[/medjool/i,'medjool dates (not Larder)'],[/skewer/i,'fruit skewers (not listed by Paula)'],[/juice flavour|juicer|fresh juice deliver|^mango, pineapple|^kale, spinach|^carrot, celery/i,'juice station component'],[/crew meal/i,'crew meal'],[/antipasto/i,'antipasto (not listed by Paula — confirm)'],[/^dessert:?$/i,'header row (dessert)']];
function entity(ev){const p=ev.split('|').map(s=>s.trim()).filter(Boolean);if(p.length>1)return lc(p[p.length-1]);const m=ev.match(/\(([A-Z0-9]{3,})\)/);if(m)return m[1].toLowerCase();return lc(ev.replace(/\b20\d\d\b/g,'').replace(/national convention|conference|summit/ig,'').trim().split(/\s+/).slice(0,2).join(' '));}
const DW=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
function build(wo,S,E){const L=wo.lines;const out=new Map();const skipped=[];const trace=[];let ord=0;
 const isAmex=ev=>/american express|amex/i.test(ev);const artists=new Set(L.filter(l=>/ent cent|green room|tiktok/i.test(l.room)&&!l.event.includes('|')).map(l=>lc(l.event.trim())));
 const isArtist=l=>artists.has(entity(l.event));
 function put(sec,dates,dish,part,o){dates=[].concat(dates).sort();const key=sec+'|'+dates.join(',')+'|'+dish;let g=out.get(key);
  if(!g){g={section:sec,dates,date:dates[0],dish,parts:[],rows:[],first:o.r,kind:o.kind||'dish',fill:o.fill||null,flags:new Set(),round:o.round,raw:null,count:o.count};out.set(key,g);}
  if(part!=null){if(typeof part==='number'){if(!g.parts.some(p=>p.k===o.k))g.parts.push({ev:o.ev,q:part,k:o.k});}else g.raw=part;}
  if(o.flag)g.flags.add(o.flag);g.rows.push(o.r);g.first=Math.min(g.first,o.r);trace.push({woRow:o.r,dish,section:sec});return g;}
 const skip=(l,why)=>skipped.push({r:l.r,item:l.item,why});
 let ctx={},buffet={},lastHead=null;const cx0=k=>ctx[k]&&ctx[k].t;
 const nxt={};for(let i=0;i<L.length;i++){for(let j=i+1;j<L.length;j++){if(L[j].date===L[i].date&&L[j].event===L[i].event){nxt[L[i].r]=L[j];break;}}}
 const isPkgHead=l=>(l.qty>1||/^grab and go/i.test(l.item))&&nxt[l.r]&&nxt[l.r].qty<=1&&!/platter|canap|party|lunch bag|lunch box|menu|green room|juice/i.test(l.item)&&nm(nxt[l.r].item)!==nm(l.item);
 const platEv=new Set(L.filter(x=>x.colour==='C9DAF8'&&/platter/i.test(x.item)&&!/fruit/i.test(x.item)).map(x=>x.date+'|'+x.event));
 let prevL=null;const lead=t=>String(t||'').toLowerCase().replace(/[^a-z]/g,'').slice(0,10);
 for(const l of L){const ek=l.date+'|'+l.event;
  if(prevL&&l.qty>1&&prevL.qty===l.qty&&prevL.item===l.item&&prevL.room===l.room&&prevL.date===l.date&&prevL.event===l.event&&l.time&&l.cost&&prevL.time===l.time&&prevL.cost===l.cost&&prevL.colour===l.colour&&lead(prevL.notes)!==lead(l.notes)){skip(l,'same order continued on the next row (notes overflow)');prevL=l;continue;}prevL=l;const it=l.item, its=lc(it);const col=l.colour;const ev=l.event;const base={r:l.r,ev:l.r,k:l.r};
  if(!col){if(l.qty>1){const pb=buffet[ek];const join=pb&&pb.session&&lastHead===pb&&!pb.closed&&/sydney eats/i.test(it);const run=join?pb.run:{id:l.r,room:l.room};
   buffet[ek]={q:l.qty,r:l.r,name:it,run,session:/sydney eats/i.test(it),closed:join&&l.room===run.room};lastHead=buffet[ek];ctx[ek]=null;}skip(l,'event / menu header (pax passed to its dishes)');continue;}
  const sk=SKIP.find(([re])=>re.test(its));if(sk){if(!/additional canap|^cold items/i.test(its)&&!(ctx[ek]&&ctx[ek].t==='canape'&&/dietar/.test(its)));skip(l,sk[1]);continue;}
  const cx=ctx[ek];
  // ---- Retail
  if(col==='D5A6BD'){const ent=isAmex(ev)?entity(ev):entity(ev);put('Retail','RANGE:'+ent,'§'+ent,null,{...base,kind:'kiosk'}).amex=(out.get('Retail|RANGE:'+ent+'|§'+ent).amex||isAmex(ev));out.get('Retail|RANGE:'+ent+'|§'+ent).rd=(out.get('Retail|RANGE:'+ent+'|§'+ent).rd||new Set()).add(l.date);continue;}
  // ---- packages
  if(/crew grab and go lunch bag/i.test(it)){ctx[ek]={t:'bag'};buffet[ek]=null;put('Sandwich',l.date,'lunchbag',l.qty,{...base,kind:'sum'});continue;}
  if(/^lunch box/i.test(it)){ctx[ek]={t:'bag'};buffet[ek]=null;const g=put('Sandwich',l.date,'LUNCHBOX',l.qty,{...base,kind:'sum'});if(/cockle bay/i.test(l.room))g.flags.add('Includes the Cockle Bay lunch boxes (row '+l.r+') — Paula left these out; confirm');continue;}
  if(col==='C9DAF8'&&(/generic menu item|deconstructed custom lunch box/i.test(it))&&l.qty>=30){ctx[ek]={t:'bag'};buffet[ek]=null;put('Sandwich',l.date,(entity(ev).toUpperCase())+' bread spread',l.qty,{...base,kind:'sum'});continue;}
  if(/custom lunch menu|custon lunch menu/i.test(it)&&col!=='FFC000'){ctx[ek]={t:'bag'};buffet[ek]=null;
   if(/mezze/i.test(l.notes)){put('Salad','RANGE:mezze-'+entity(ev),entity(ev).toUpperCase()+' Mezze',l.qty,{...base,k:'mezze',kind:'mezze'}).rd=(out.get('Salad|RANGE:mezze-'+entity(ev)+'|'+entity(ev).toUpperCase()+' Mezze').rd||new Set()).add(l.date);
    const ns=String(l.notes).split('\n');const i=ns.findIndex(x=>/^\s*salads?\s*$/i.test(x));if(i>=0)for(const x of ns.slice(i+1)){if(!x.trim())continue;if(/^\s*[A-Z ]{4,}\s*$/.test(x))break;put('Salad',l.date,nm(x)+(/salad/i.test(nm(x))?'':' salad'),l.qty,{...base});}}
   else skip(l,'custom buffet menu with no Larder dishes identified (confirm)');continue;}
  if(/canap[eé] party/i.test(it)&&/continued/i.test(l.notes||'')){ctx[ek]={t:'canape-cont'};skip(l,'canapé package continued (same party as the 1st hour)');continue;}
  if(cx0(ek)==='canape-cont'&&col==='F4CCCC'&&l.qty<=1){skip(l,'canapé package continued (same party)');continue;}
  if(/canap[eé] party/i.test(it)){const ns=String(l.notes||'').split('\n').filter(x=>/^\s*\d+\s+\S/.test(x)&&!/^\s*\d+\s*x\s/i.test(x));let pax=l.qty,names=[];
   let cut=String(l.notes||'').split(/dietary:?/i)[0].split('\n').filter(x=>/^\s*\d+\s*-?\s+[A-Za-z]/.test(x)&&!/^\s*\d+\s*ea\b/i.test(x));
   if(cut.length){names=cut.map(x=>canName(x.replace(/^\s*\d+\s*-?\s*/,''))).filter(Boolean);const nums=cut.map(x=>+x.match(/\d+/)[0]);const mode=nums.sort((a,b)=>nums.filter(v=>v===b).length-nums.filter(v=>v===a).length)[0];if(mode&&mode!==l.qty){pax=mode;}}
   ctx[ek]={t:'canape',g:null,names,pax,r:l.r,flag:pax!==l.qty?'Pax '+pax+' from the notes vs party headcount '+l.qty+' — confirm':null};buffet[ek]=null;
   if(names.length){const c=ctx[ek];c.g=put('Canape',l.date,'#party'+l.r,pax,{...base,kind:'party',flag:c.flag});c.g.names=names;c.done=true;}else{const c=ctx[ek];c.g=put('Canape',l.date,'#party'+l.r,pax,{...base,kind:'party'});c.g.names=[];}
   continue;}
  if(col==='F4CCCC'&&cx&&cx.t==='canape'&&l.qty<=1){if(!cx.done){const n=canName(it);if(n&&!cx.g.names.includes(n))cx.g.names.push(n);cx.g.rows.push(l.r);}trace.push({woRow:l.r,dish:'(in party)',section:'Canape'});continue;}
  // ---- green room
  const gr=/green room/i.test(it)&&isArtist(l);const art=entity(ev);
  if(gr&&col==='D9EAD3'){put('Salad',l.date,art+' green room',null,{...base,kind:'green',fill:CYAN});continue;}
  if(gr&&col==='C9DAF8'){put('Sandwich',l.date,art+' green room',l.qty,{...base,kind:'sum'});continue;}
  if(col==='FFC000'){const p=String(l.notes||'').match(/(\d+)\s*(x\s*)?round\s*poppy/i)||String(l.notes||'').match(/(\d+)\s*x\s*poppy/i);
   if(/juice station|juice bar/i.test(it)){put('Fruits',l.date,'juice station',1,{...base,k:'juice',kind:'count'});continue;}
   if(/fruit platter/i.test(it)){put('Fruits',l.date,'FRUIT PLATTER',l.qty||1,{...base,kind:'count'});continue;}
   if(/custom lunch menu/i.test(it)){put('Fruits',l.date,'FRUIT PLATTER',p?+p[1]:1,{...base,kind:'count'});continue;}
   if(p&&/green room/i.test(it)){put('Fruits',l.date,'FRUIT PLATTER',+p[1],{...base,kind:'count',flag:'Includes green-room fruit poppies from the notes — confirm count'});continue;}
   skip(l,'fruit row with no platter count');continue;}
  if(col==='F4CCCC'){if(/green room/i.test(it)){const ns=String(l.notes||'').split('\n').filter(x=>/box|sushi|duck|nigiri/i.test(x)&&!/dietar/i.test(x));const names=[...new Set(ns.map(canName).filter(Boolean))];
     const g=put('Canape',l.date,'#party'+l.r,l.qty,{...base,kind:'party'});g.names=names.length?names:[nm(it)];continue;}
   if(/ASN|custom sydney eats/i.test(it)){const body=String(l.notes||'').split(/dietary:?/i)[0];const names=body.split('\n').filter(x=>/^\s*\d+\s*-/.test(x)).map(x=>canName(x.replace(/^\s*\d+\s*-\s*/,'')));const g=put('Canape',l.date,'#party'+l.r,l.qty,{...base,kind:'party',flag:'Party headcount '+l.qty+' (Paula wrote a lower round figure last time) — confirm'});g.names=names;continue;}
   if(/rice paper/i.test(it)){put('Canape',l.date,'rice paper roll',l.qty,{...base,kind:'count'});continue;}
   if(/sushi platter/i.test(it)){put('Canape',l.date,'sushi platter',l.qty,{...base,kind:'count'});continue;}
   put('Canape',l.date,nm(it),l.qty,{...base});continue;}
  // ---- ASN / custom Sydney Eats menus (ESA)
  if(/ASN menu|custom sydney eats/i.test(it)){buffet[ek]=null;ctx[ek]={t:'bag'};let type=null,seen=[];for(const x0 of String(l.notes||'').split('\n')){const x=x0.replace(/^[\s"'\-]+|["'\s]+$/g,'');if(!x)continue;
    const h=x.match(/^(salad|sandwich|wrap)s?\b\s*(-.*)?$/i);if(h){type=h[1].toLowerCase();continue;}if(/dietar|baucher/i.test(x)){type=null;continue;}if(!type||/^\d+\s*(zuma|x)?\s*$/i.test(x)||/^\d+\s*zuma/i.test(x))continue;
    let n=nm(x.replace(/\s+x\s*\d+\s*$/i,''));if(!new RegExp(type).test(n))n+=' '+type;const sec=type==='salad'?'Salad':'Sandwich';
    let key=n;if(type!=='salad'&&seen.some(s=>nm(s)===nm(x)))key=entity(ev).split(/[- ]/)[0].toUpperCase()+' LUNCH';seen.push(x);
    put(sec,l.date,key,l.qty,{...base,k:l.r,round:true});type=type==='salad'?'salad-done':type;if(sec==='Salad')put('Salad',l.date,'salad bar',l.qty,{...base,k:l.r,round:true,kind:'bar'});
    if(type==='salad-done')type=null;}continue;}
  // ---- platters / pieces
  if(col==='C9DAF8'&&/platter/i.test(it)&&!/fruit/i.test(it)){buffet[ek]=null;ctx[ek]={t:'platter'};
   if(/bagel/i.test(it)){put('Sandwich',l.date,'salmon bagel',(l.qty||1)*10,{...base,kind:'sum',fill:CYAN});continue;}
   if(/croissant/i.test(it)){const mk=String(l.notes||'').match(/make\s*(\d+)/i);put('Sandwich',l.date,'turkey croissant',(l.qty||1)*12,{...base,kind:'sum',fill:CYAN,flag:mk?'Notes say make '+mk[1]+' platters; counted '+l.qty+' — confirm':null});continue;}
   put('Sandwich',l.date,'sandwich platters',l.qty||1,{...base,kind:'count',flag:'Platter total — Paula\'s counts differed by 1–6 last time; confirm'});continue;}
  if(col==='70AD47'){const n=/cheese and charcuterie/i.test(it)?'cheese and charcuterie':/cheese platter/i.test(it)?'cheese platter':/charcuterie/i.test(it)?'charcuterie platter':nm(it);
   put('Salad',l.date,n,typeof l.qtyRaw==='string'&&isNaN(+l.qtyRaw)?l.qtyRaw.trim():l.qty,{...base,kind:'count'});continue;}
  if(col==='C9DAF8'&&/^(sandwich|wrap)\s*-/i.test(it)&&platEv.has(ek)&&(!buffet[ek]||buffet[ek].grab)){skip(l,'platter filling (choice inside a sandwich/wrap platter order)');continue;}
  if(isPkgHead(l)){buffet[ek]={q:l.qty,r:l.r,name:it,grab:true};ctx[ek]=null;skip(l,'package header (pax passed to its dishes)');continue;}
  // ---- children of packages
  if(l.qty<=1&&cx&&(cx.t==='bag'||cx.t==='platter')&&!buffet[ek]){skip(l,cx.t==='bag'?'lunch bag / box filling':'platter filling');continue;}
  const sec=col==='C9DAF8'?'Sandwich':'Salad';
  if(buffet[ek]&&l.qty<=1){const b=buffet[ek];let n=nm(it);if(/breakfast/i.test(b.name)&&!b.grab&&!/bfast|breakfast/.test(n))n+=' bfast';if(/croissant/i.test(it))n='turkey croissant';if(/ham.*sourdough|ham.*cheddar/i.test(it))n='ham and cheese toastie';
   const g=put(sec,l.date,n,b.q,{...base,k:b.r,ev:b.run?b.run.id:b.r,fill:n==='turkey croissant'?CYAN:null});
   if(sec==='Salad'&&!b.grab&&/sydney eats/i.test(b.name)){put('Salad',l.date,'salad bar',b.q,{...base,k:b.r,ev:b.run?b.run.id:b.r,kind:'bar'}).syd=true;}
   if(/sydney eats/i.test(b.name))g.syd=true;continue;}
  if(l.qty<=0){skip(l,'qty 0 (filling)');continue;}
  put(sec,l.date,nm(it),l.qty||l.qtyRaw,{...base,flag:/^served with/i.test(it)?'Side salad for a plated menu (dish in the notes) — confirm whether Larder makes it':null});}
 // ---- finalise
 const lines=[];const dw=d=>DW[new Date(d+'T00:00').getDay()];
 for(const g of out.values()){let dish=g.dish,dates=g.dates,dayWord=null;
  if(g.rd){dates=[...g.rd].sort();dayWord=dates.length>1?dw(dates[0])+' - '+dw(dates[dates.length-1]):dw(dates[0]);}
  if(dish[0]==='§'){const ent=dish.slice(1);dish=ent+(g.amex?' kiosk & amex':' kiosk');}
  if(dish.startsWith('#party'))dish=(g.names||[]).filter((x,i,a)=>a.indexOf(x)===i).join(' / ')||'canapé party';
  const evs=[];for(const p of g.parts){let e=evs.find(x=>x.ev===p.ev);if(!e)evs.push(e={ev:p.ev,q:0});e.q+=p.q;}
  if(g.syd)for(const e of evs)if(e.q>=500&&e.q%100){g.flags.add('Session total '+e.q+' rounded to '+Math.round(e.q/100)*100);e.q=Math.round(e.q/100)*100;}
  let total=evs.reduce((a,b)=>a+b.q,0);let pv=null;
  if(g.raw!=null)pv=g.raw;else if(evs.length){if(g.round){pv=total;}if(g.round&&total>=500){const t=Math.round(total/100)*100;if(t!==total)g.flags.add('Rounded '+total+' → '+t+' (ESA rule)');total=t;pv=t;}
   else if(g.kind==='count'||g.kind==='mezze'||g.kind==='green')pv=total;else pv=evs.length>1?'='+evs.map(e=>e.q).join('+'):total;}
  if(g.syd&&evs.length>1)g.flags.add('Sum of Sydney Eats sessions per event — Paula sometimes applies a 0.8 ratio or a different figure; confirm');
  if(g.kind==='mezze')pv=evs.length?evs[0].q:null;
  lines.push({section:g.section,date:dates[0],dates,dish,paxValue:pv,paxTotal:typeof pv==='number'?pv:total,dayWord,fill:g.fill,flag:[...g.flags].join(' · ')||null,woRows:[...new Set(g.rows)],first:g.first,kind:g.kind,syd:!!g.syd});}
 // salad bar parts deduped by header row already (k). Lines that are only 'salad bar' with no salads? fine.
 return {lines,skipped,trace};}
const API={build,nm,canName,CYAN};root.AllocRulesV2=API;if(typeof module!=='undefined')module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
