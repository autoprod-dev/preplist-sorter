/* Prepline: accept the raw "Kitchen - Work Orders" export (with a PrepArea column and no colour coding).
   Re-maps its columns to the colour-coded layout, keeps one week, and fills in the category colours
   that are otherwise added by hand. Best guesses only; everything stays editable. No real data in here. */
(function(root){
const clean=v=>v==null?'':String(v).replace(/\u00a0/g,' ').trim();
const SAND='C9DAF8',SALAD='B6D7A8',GREEN='D9EAD3',FRUIT='FFC000',PLAT='70AD47',KIOSK='D5A6BD',CAN='F4CCCC';
const KEEP_AREAS=/^(larder|combo|other)$/i;
const NOT_LARDER=/botanical water|^(hot dish|plant based|sweet|dessert)\s*-|^additional big bite|after dark canap|^breakfast on the go|^juicer$|^dietary option|^chef$|^hot items|ice cream|gelato|sharing bowls|^plated menu|main course|alternate serve|^no signature|service fee|fridge|karanda bar|chef's selection$|spoons|^table allocation|coffee|espresso|barista|nespresso|\bteas?\b|filtered (ice )?water|additional hours|hire\b|^monday\s*-\s*friday|service staff|staff\b|mugs|pods\b/i;
const MENU_HEAD=/(?!)/; // reserved: menu headers Paula leaves white (no gain on this week's data)
const RULES=[
 [/retail kiosk/i,KIOSK],
 [/^grab and go breakfast|kale, and quinoa salad/i,GREEN],
 [/^cookie, whole fruit/i,SAND],
 [/^(sandwich|wrap)\s*-|^piece of whole seasonal fruit/i,SAND],
 [/^salad( bowl)?\s*-/i,SALAD],
 [/canap|^cold items|sushi|rice paper|oyster|tartlet|vol.?au.?vent|\btacos?\b|pancake|miang|bresaola|lettuce cups|coyo|crew meal/i,CAN],
 [/fruit platter|sliced fruit|juice|juicer|agave|turmeric|coconut water|granny smith|fruit skewer|medjool/i,FRUIT],
 [/cheese (and charcuterie )?platter|chef's selection cheese|charcuterie|antipasto|\brider\b|promoter/i,PLAT],
 [/green room/i,GREEN],
 [/sandwich|\bwraps?\b|lunch bag|lunch box|grab and go|on the go|luncheon|croissant|toast|generic menu item|asn menu|custom sydney eats|deconstructed|bagel/i,SAND],
 [/salad|poke|handbowl|custo?n? lunch menu|^dietary/i,SALAD]];
function classify(item,area){if(NOT_LARDER.test(item))return null;for(const [re,c] of RULES)if(re.test(item))return c;return null;}
function isRaw(rows){return rows.slice(0,6).some(x=>/^prep\s*area$/i.test(clean(x.H))&&/description/i.test(clean(x.I)));}
const DAYRE=/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+(\d{1,2})\s+([a-z]+),?\s+(\d{4})/i;
const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
function dayOf(t){const m=clean(t).match(DAYRE);if(!m)return null;const d=new Date(m[2]+' '+m[3]+' '+m[4]);return isNaN(d)?null:iso(d);}
const addDays=(s,n)=>{const d=new Date(s+'T00:00');d.setDate(d.getDate()+n);return iso(d);};
function mondays(rows){const s=new Set();for(const x of rows){const d=dayOf(x.A);if(d){const w=new Date(d+'T00:00').getDay();s.add(addDays(d,-((w+6)%7)));}}return [...s].sort();}
function defaultWeek(rows){const ds=rows.map(x=>dayOf(x.A)).filter(Boolean).sort();if(!ds.length)return null;const f=ds[0],w=new Date(f+'T00:00').getDay();return w===1?f:addDays(f,(8-w)%7||7);}
/* raw: F room G qty H PrepArea I item J notes K status L order form M cost N by O on P booth Q end time
   coded layout: F room G qty H item I notes J order form K cost L by M on O end time */
function normalise(rows,weekStart){const start=weekStart||defaultWeek(rows);const end=addDays(start,8);const out=[];let day=null,keepDay=false,last={};let stats={rows:0,kept:0,coloured:0,dropped:0};
 for(const x of rows){const d=dayOf(x.A);if(d){day=d;keepDay=d>=start&&d<=end;if(keepDay)out.push({r:x.r,A:x.A});continue;}
  if(!keepDay)continue;const area=clean(x.H);
  if(!clean(x.F)){out.push({r:x.r,A:x.A,B:x.B,C:x.C,D:x.D,E:x.E});continue;}
  if(/^prep\s*area$/i.test(area))continue;
  stats.rows++;if(area&&!KEEP_AREAS.test(area)){stats.dropped++;continue;}
  const item=clean(x.I);const key=day+'|'+clean(x.F);let fill=item?classify(item,area):null;
  if((Number(x.G)||0)>1&&MENU_HEAD.test(item)){last[key]=fill;fill=null;}   // menu header: Paula leaves it white so its pax pass to the dishes under it
  if(!area&&(Number(x.G)||0)<=1&&last[key]&&!NOT_LARDER.test(clean(x.I)))fill=last[key];   // package filling: same colour as its package
  if(fill&&(area||(Number(x.G)||0)>1))last[key]=fill;
  if(fill)stats.coloured++;stats.kept++;
  out.push({r:x.r,A:x.A,B:x.B,C:x.C,D:x.D,E:x.E,F:x.F,G:x.G,H:x.I,I:x.J,J:x.L,K:x.M,L:x.N,M:x.O,O:x.Q,fill,fillA:null,prepArea:area||null,inferred:true});}
 return {rows:out,weekStart:start,stats};}
/* Staffing rules from the planner (27 Oct 2026 + follow-ups). Tables are [upTo, staff]; first row whose upTo >= pax wins.
   Prep numbers INCLUDE the chefs coming off service (service ends 11, prep after the break), written "after service + N". */
const ALLOC_RATIOS=root.ALLOC_RATIOS||{
 service:{Sandwich:{sydEats:[[599,4],[1000,5],[Infinity,6]],other:[[150,1],[400,2],[599,3],[1000,4],[Infinity,5]],max:6},
          Salad:{sydEats:[[599,2],[1000,3],[Infinity,4]],other:[[300,1],[599,2],[1000,3],[Infinity,4]]}},
 prep:{Sandwich:{sydEats:[[500,5],[800,6],[Infinity,8]],other:[[150,1],[300,2],[500,3],[800,4],[Infinity,5]]},
       Salad:{sydEats:[[599,2],[1000,3],[Infinity,4]]}},
 saladNoSyd:{typesPerPerson:2,pax:300},              // no Sydney Eats: 2 salad types per 300 pax = 1 person, same both prep days
 platters:{perBatch:10,day1:{upTo3:1,from4to6:2,over6:2},day2AfterService:4,day2FullShift:2}, // 4-6 flavours = 2 (open question)
 deliveriesPerson:1,retail:1,retailAmex:2,
 fruitPlatters:[[10,1],[Infinity,2]],juiceStation:1,
 canapePrep:{pax:300,itemsPerPerson:2},canapeService:{pax:500,itemsPerPerson:3},
 canapeNoPrep:/peking duck|sushi|nigiri|rice paper|oyster/i,
 boughtIn:/sushi platter|rice paper|peking duck/i,
 teamCafe:1,coffeeShopDays:['tuesday','thursday','saturday'],
 sundayBreakfastBefore:7*60+30,
 stickers:{pax:1000,staff:1},
 lunchboxNote:'Line guide per 100: bento 25+20 min, 12 + 1-2 leaders; LB1 10+10 min, 7+1; LB2 20+10 min, 7+1; LB3 20+10 min, 8+1'};
const CYANF='00FFFF';
function paxNum(v){if(typeof v==='number')return v;const s=String(v==null?'':v).replace(/^=/,'');return /^[\d+\s.]+$/.test(s)?s.split('+').reduce((a,b)=>a+(Number(b)||0),0):0;}
const pick=(t,p)=>{for(const [u,n] of t)if(p<=u)return n;return t[t.length-1][1];};
function staffFor(sec,pax,R,o){R=R||ALLOC_RATIOS;o=o||{};const T=(R[o.prep?'prep':'service']||{})[sec];if(!T)return null;const t=o.syd?T.sydEats:(T.other||T.sydEats);let n=pick(t,pax);if(T.max)n=Math.min(n,T.max);return n;}
const isLunchbox=l=>/lunch ?box|lunchbag|grab and go|bento/i.test(l.dish||'');
const isEntree=l=>/\bentr[eé]e\b/i.test(l.dish||'');
const canItems=(l,R,prep)=>String(l.dish||'').split(' / ').filter(x=>x&&!(prep&&R.canapeNoPrep.test(x))).length;
const ymd=x=>x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');
const addD=(d,n)=>{const x=new Date(d+'T00:00');x.setDate(x.getDate()+n);return ymd(x);};
const dowOf=d=>new Date(d+'T00:00').getDay();
/* Prep calendar: [first prep day, finishing day]. Normally D-2, D-1. Monday functions: Fri, Sat. Tuesday: Sat, Mon (closed Sunday). */
function prepDays(d){const w=dowOf(d);if(w===1)return [addD(d,-3),addD(d,-2)];if(w===2)return [addD(d,-3),addD(d,-1)];return [addD(d,-2),addD(d,-1)];}
function sundayRostered(res,sh){if(sh.dayName!=='sunday')return true;if(sh.service.some(b=>b.lines.some(l=>l&&l.dish)))return true;
 const mon=addD(sh.date,1);return (res.lines||[]).some(l=>l.date===mon&&/bfast|breakfast/i.test(l.dish||'')&&l.startMin!=null&&l.startMin<ALLOC_RATIOS.sundayBreakfastBefore);}
function applyStaff(res,R){R=R||ALLOC_RATIOS;
 for(const sh of res.sheets){const dn=sh.dayName;const rostered=sundayRostered(res,sh);const svc={};
  for(const [bk,blocks] of [['service',sh.service],['prep',sh.prep]])for(const blk of blocks){const sec=blk.key;const prep=bk==='prep';
   blk.lines=blk.lines.filter(l=>!l||!isEntree(l));
   for(const l of blk.lines)if(l&&l.staff==='after service')l.staff='';
   if(prep)for(const l of blk.lines)if(l&&l.dish&&String(l.dish).split(' / ').every(x=>R.boughtIn.test(x)||R.canapeNoPrep.test(x))&&String(l.dish).split(' / ').some(x=>R.boughtIn.test(x))){l.fill=CYANF;l.noPrep=true;}
   if(!prep)for(const l of blk.lines)if(l&&/\bbfast\b|breakfast|green room/i.test(l.dish||''))l.fill=CYANF;
   const fmt=n=>{if(!prep||!n)return n;const s=svc[sec]||0;return s?(n-s>0?'after service + '+(n-s):'after service'):n;};
   if(sec==='Retail'){const later=blk.lines.some(l=>l&&(l.dates||[l.date]).some(d=>d&&d>sh.date));const wk=dn==='saturday'||dn==='sunday';const seen=new Set();
    for(const l of blk.lines){if(!l||!l.dish||seen.has(l.dish))continue;seen.add(l.dish);if(wk&&!later)continue;l.staff=/amex/i.test(l.dish)?R.retailAmex:R.retail;}continue;}
   if(sec==='Fruits'){let plat=0,juice=0;const ls=blk.lines.filter(l=>l&&l.dish&&l.date&&prepDays(l.date)[0]===sh.date);for(const l of ls){if(/juice/i.test(l.dish))juice=1;else plat+=paxNum(l.paxValue);}
    if(ls.length){const n=(plat?pick(R.fruitPlatters,plat):0)+(juice?R.juiceStation:0);if(n)ls[0].staff=n;}continue;}
   if(sec==='Coffee'){if(R.coffeeShopDays.includes(dn))blk.lines.push({dish:'coffee shop',paxValue:null,dayWord:dn,staff:1});continue;}
   const groups=new Map();
   for(const l of blk.lines){if(!l||!l.dish||l.noPrep)continue;const g=l.date||l.dayWord||'';if(!groups.has(g))groups.set(g,[]);groups.get(g).push(l);}
   let dayCanape=0,canFirst=null,svcTotal=0;
   for(const [d,ls0] of groups){let stage='service';if(prep){const pd=prepDays(d);stage=pd[0]===sh.date?'first':pd[1]===sh.date?'finish':'none';}
    let ls=ls0;
    if(sec==='Sandwich'){const lb=ls.filter(isLunchbox);ls=ls.filter(l=>!isLunchbox(l));
     for(const l of lb){l.staff='';if(prep&&d===addD(sh.date,1)&&paxNum(l.paxValue)>=R.stickers.pax)l.staff=R.stickers.staff+' (stickers)';if(!l.notes&&/lunch ?box|bento/i.test(l.dish))l.notes=R.lunchboxNote;}}
    if(!ls.length||stage==='none')continue;const f=ls[0];
    if(sec==='Canape'){let n=0;for(const l of ls){const k=canItems(l,R,prep),p=paxNum(l.paxValue)||0;const c=prep?R.canapePrep:R.canapeService;if(k&&p)n+=k/c.itemsPerPerson*p/c.pax;}
     if(!prep){dayCanape+=n;canFirst=canFirst||f;continue;}
     if(stage==='finish'){f.staff='after service';continue;}if(n)f.staff=fmt(Math.max(1,Math.ceil(n)));continue;}
    const syd=ls.some(l=>l.syd);const pax=Math.max(0,...ls.map(l=>paxNum(l.paxValue)));
    if(prep&&sec==='Salad'&&!syd){const k=ls.filter(l=>!/salad bar/i.test(l.dish)&&(l.kind!=='count')).length;const pp=Math.max(0,...ls.map(l=>paxNum(l.paxValue)));
     const n=Math.max(1,Math.ceil(k/R.saladNoSyd.typesPerPerson*pp/R.saladNoSyd.pax));f.staff=fmt(n);continue;}
    const plats=ls.filter(l=>/sandwich platters/i.test(l.dish));
    if(prep&&sec==='Sandwich'&&!syd&&plats.length){const np=plats.reduce((a,l)=>a+paxNum(l.paxValue),0);const b=Math.ceil(np/R.platters.perBatch);const pf=plats[0];
     const fl=pf.flavours||0;const rate=fl>6?R.platters.day1.over6:fl>=4?R.platters.day1.from4to6:R.platters.day1.upTo3;
     pf.staff=stage==='first'?fmt(b*rate):'after service + '+b*R.platters.day2AfterService;if(stage==='finish')pf.notes=(pf.notes?pf.notes+' · ':'')+'or '+b*R.platters.day2FullShift+' full-shift';
     ls=ls.filter(l=>!plats.includes(l));if(!ls.length)continue;}
    const f2=ls[0];let n=staffFor(sec,pax,R,{prep,syd});if(n==null)continue;
    if(!prep){svcTotal+=n;f2.staff=n;continue;}
    if(stage==='finish'){f2.staff='after service';continue;}
    if(sec==='Sandwich'&&syd)n+=R.deliveriesPerson;
    f2.staff=fmt(n);}
   if(canFirst&&dayCanape){const n=Math.max(1,Math.ceil(dayCanape));canFirst.staff=n;svcTotal+=n;}
   if(!prep){if(sec==='Salad'&&blk.lines.some(l=>l&&l.dish))blk.lines.push({dish:'team cafe (leftover salad)',paxValue:null,dayWord:dn,staff:R.teamCafe});
    svc[sec]=svcTotal;}}
  if(!rostered){for(const blk of [...sh.service,...sh.prep])for(const l of blk.lines)if(l&&l.staff){l.notes=(l.notes?l.notes+' · ':'')+'suggested '+l.staff+' (usually closed Sunday; no service or Monday breakfast before 7:30)';l.staff='';}}}
 return res;}
const API={ALLOC_RATIOS,applyStaff,staffFor,isRaw,normalise,mondays,defaultWeek,classify};root.AllocRaw=API;if(typeof module!=='undefined')module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
