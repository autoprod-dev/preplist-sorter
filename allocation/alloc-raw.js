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
/* Best-guess ratios inferred from Paula's week of 26 Oct sheet. Replace these numbers when Paula sends hers.
   staffPaxPerHead: one staff per N pax (largest pax in the group), rounded up, then clamped to min/max.
   fixedStaff: sections staffed by a fixed number regardless of pax. */
const ALLOC_RATIOS=root.ALLOC_RATIOS||{
 staffPaxPerHead:{Sandwich:600,Salad:800,Canape:300,Fruits:500,Platters:800,Entree:300,Coffee:null},
 fixedStaff:{Retail:2,Kiosk:2},minStaff:1,maxStaff:{Sandwich:6,Salad:3,Canape:5,Fruits:2,default:4}};
function paxNum(v){if(typeof v==='number')return v;const s=String(v==null?'':v).replace(/^=/,'');return /^[\d+\s.]+$/.test(s)?s.split('+').reduce((a,b)=>a+(Number(b)||0),0):0;}
function staffFor(sec,pax,R){R=R||ALLOC_RATIOS;if(R.fixedStaff[sec]!=null)return R.fixedStaff[sec];const n=R.staffPaxPerHead[sec];if(!n)return null;
 const mx=R.maxStaff[sec]||R.maxStaff.default;return Math.min(mx,Math.max(R.minStaff,Math.ceil(pax/n)));}
/* Fill Staff Required on the first line of each (section, function date) group where it is blank. */
function applyStaff(res,R){for(const sh of res.sheets)for(const blk of [...sh.service,...sh.prep]){const sec=blk.key;const groups=new Map();
 for(const l of blk.lines){if(!l||!l.dish)continue;const g=l.date||l.dayWord||'';if(!groups.has(g))groups.set(g,[]);groups.get(g).push(l);}
 for(const ls of groups.values()){const pax=Math.max(0,...ls.map(l=>paxNum(l.paxValue)));const n=staffFor(sec,pax,R);if(n==null)continue;const f=ls[0];
  if(!f.staff)f.staff=n;else if(f.staff==='after service')f.staff='after service + '+n;}}
 return res;}
const API={ALLOC_RATIOS,applyStaff,staffFor,isRaw,normalise,mondays,defaultWeek,classify};root.AllocRaw=API;if(typeof module!=='undefined')module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
