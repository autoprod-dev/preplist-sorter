/* Prepline: accept the raw "Kitchen - Work Orders" export (with a PrepArea column and no colour coding).
   Re-maps its columns to the colour-coded layout, keeps one week, and fills in the category colours
   that are otherwise added by hand. Best guesses only; everything stays editable. No real data in here. */
(function(root){
const clean=v=>v==null?'':String(v).replace(/\u00a0/g,' ').trim();
const SAND='C9DAF8',SALAD='B6D7A8',GREEN='D9EAD3',FRUIT='FFC000',PLAT='70AD47',KIOSK='D5A6BD',CAN='F4CCCC';
const KEEP_AREAS=/^(larder|combo|other)$/i;
const NOT_LARDER=/botanical water|^cookie, whole fruit|^dietary option|^chef$|^hot items|ice cream|gelato|sharing bowls|^plated menu|main course|alternate serve|^no signature|service fee|fridge|karanda bar|chef's selection$|spoons|^table allocation|coffee|espresso|barista|nespresso|\bteas?\b|filtered (ice )?water|additional hours|hire\b|^monday\s*-\s*friday|service staff|staff\b|^canap[eé] party|mugs|pods\b/i;
const RULES=[
 [/retail kiosk/i,KIOSK],
 [/^(sandwich|wrap)\s*-|^piece of whole seasonal fruit/i,SAND],
 [/^salad( bowl)?\s*-/i,SALAD],
 [/canap|^cold items|sushi|rice paper|oyster|tartlet|vol.?au.?vent|\btacos?\b|pancake|miang|bresaola|lettuce cups|coyo|crew meal/i,CAN],
 [/fruit platter|sliced fruit|juice|juicer|agave|turmeric|coconut water|granny smith|fruit skewer|medjool|bioplastic cups/i,FRUIT],
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
  if(!area&&(Number(x.G)||0)<=1&&last[key]&&!NOT_LARDER.test(String(x.H||'')))fill=last[key];   // package filling: same colour as its package
  if(fill&&(area||(Number(x.G)||0)>1))last[key]=fill;
  if(fill)stats.coloured++;stats.kept++;
  out.push({r:x.r,A:x.A,B:x.B,C:x.C,D:x.D,E:x.E,F:x.F,G:x.G,H:x.I,I:x.J,J:x.L,K:x.M,L:x.N,M:x.O,O:x.Q,fill,fillA:null,prepArea:area||null,inferred:true});}
 return {rows:out,weekStart:start,stats};}
const API={isRaw,normalise,mondays,defaultWeek,classify};root.AllocRaw=API;if(typeof module!=='undefined')module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
