import json, shutil, sys, re
from playwright.sync_api import sync_playwright
S='/workspace/prepline-v3/tests/v3/samples/'; OLD='/tmp/master-dc0f059.html'; NEW='/tmp/live-index.html'
DST='/tmp/livesite/preplist-sorter/index.html'; URL='http://127.0.0.1:8766/preplist-sorter/index.html'
SH='/workspace/prepline-v2-shots/v3.2.4-live-migration/'
res=[]
def check(n,ok,info=''): res.append(ok); print(('PASS ' if ok else 'FAIL ')+n+(('  | '+str(info)[:300]) if info!='' else ''))
SNAP="""JSON.stringify({rows:ROWS.map(r=>[r.dish,r.task,String(r.qty),r.unit,r.section,r.day||'']), pax:paxByDish, leaders:leaderBySection,
 db:Object.keys(JSON.parse(localStorage.getItem('preplistDishDatabase_v1')||'{}')).sort()})"""
with sync_playwright() as p:
  for name, sample in [('pdf','sample-recipes.pdf'),('xlsx','pax-scaling.xlsx')]:
    prof=f'/tmp/migprof-{name}'; shutil.rmtree(prof, ignore_errors=True)
    shutil.copy(OLD, DST)
    ctx=p.chromium.launch_persistent_context(prof, headless=True, viewport={'width':1280,'height':900})
    pg=ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_load_state('networkidle')
    check(f'{name}: old build loaded (dc0f059, title Preplist Sorter)', 'Preplist' in pg.title(), pg.title())
    # recipe database entry in the old build
    pg.evaluate("setToolMode('database')"); pg.set_input_files('#fileInput', S+'awkward-tabs.xlsx'); pg.wait_for_timeout(3000)
    dbn=pg.evaluate('Object.keys(dishDatabase).length'); check(f'{name}: old build saved recipes to its database', dbn>0, dbn)
    pg.evaluate("setToolMode('onetime')"); pg.wait_for_timeout(300)
    pg.set_input_files('#fileInput', S+sample); pg.wait_for_timeout(5000)
    n=pg.evaluate('ROWS.length'); check(f'{name}: old build sorted the file', n>0, n)
    # type pax for the first two dishes via the old pax panel
    boxes=pg.locator('#paxList input'); k=min(2,boxes.count())
    for i,v in zip(range(k),['45','80']):
        boxes.nth(i).fill(v); boxes.nth(i).dispatch_event('change')
    # move one task to another section + set a day, set a section leader (what the old UI dropdowns do)
    pg.evaluate("""(()=>{ROWS[0].section = SECTIONS.find(x=>x!==ROWS[0].section && x!=='Vegetables'); ROWS[0].flagged=false; ROWS[1].day='Fri';
      leaderBySection['Vegetables']='Sam'; render(); saveOnetimeSession();})()""")
    pg.wait_for_timeout(1200)
    before=json.loads(pg.evaluate(SNAP)); raw_before=pg.evaluate("localStorage.getItem('preplistOnetimeSession_v1')")
    vis_before=pg.inner_text('#resultsArea')
    pg.screenshot(path=SH+f'{name}-1-old-dc0f059.png', full_page=False)
    check(f'{name}: old build saved a session', bool(raw_before) and len(before['rows'])==n, len(raw_before or ''))
    check(f'{name}: old JS errors none', not errs, errs)
    # swap to v3.2.4 live build at the SAME URL / profile
    shutil.copy(NEW, DST); errs.clear()
    pg.goto(URL+'?v=new'); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(1500)
    ver=pg.evaluate("document.querySelector('meta[name=prepline-version]')?.content")
    check(f'{name}: new build loaded at same origin (v3.2.4)', ver=='3.2.4', ver)
    after=json.loads(pg.evaluate(SNAP))
    check(f'{name}: all rows restored (dish, task, qty, unit, section, day)', after['rows']==before['rows'], (len(before['rows']),len(after['rows']), [ (a,b) for a,b in zip(before['rows'],after['rows']) if a!=b][:3]))
    pb={k:v for k,v in before['pax'].items() if v is not None}; pa={k:v for k,v in after['pax'].items() if v not in (None,'')}
    check(f'{name}: pax restored', all(str(pa.get(k))==str(v) or (str(pa.get(k)).rstrip('0').rstrip('.')==str(v).rstrip('0').rstrip('.')) for k,v in pb.items()) and len(pb)>0, (pb,pa))
    check(f'{name}: section leader restored', after['leaders'].get('Vegetables')=='Sam', after['leaders'])
    check(f'{name}: recipe database kept', after['db']==before['db'] and len(after['db'])>0, after['db'])
    body=pg.inner_text('body')
    tasks=[r[1] for r in before['rows']]
    missing=[t for t in tasks if t.strip() and t.strip()[:25] not in body]
    check(f'{name}: the list shows on screen (every task visible, not blank)', not missing and pg.locator('#resultsArea tr').count()>3, missing[:4])
    check(f'{name}: no JS errors after upgrade', not errs, errs)
    pg.screenshot(path=SH+f'{name}-2-after-v3.2.4-live.png', full_page=False)
    # reload again in v3 and ensure it is stable / re-saved in v3 format
    pg.reload(); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(1200)
    after2=json.loads(pg.evaluate(SNAP))
    check(f'{name}: second reload in v3 still has the same list', after2['rows']==before['rows'])
    ctx.close()
print(f'{sum(res)}/{len(res)} passed')
