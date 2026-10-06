# Put this folder on PYTHONPATH to run the pre-3.4.0 Prepline suites unchanged against a 3.4.0 build:
# every new Playwright context starts with the welcome box already done and the sign-up endpoint
# blocked, so no test ever writes to the Sheet.  PYTHONPATH=tests/v3/signup_off python3 test_v3.py ...
try:
    from playwright.sync_api._generated import Browser, BrowserType
    INIT = "try{localStorage.setItem('prepline.signup.v1','{\"d\":\"test\"}')}catch(e){}"
    def _prep(ctx):
        ctx.add_init_script(INIT)
        ctx.route('**/script.google.com/**', lambda r: r.abort())
        ctx.route('**/script.googleusercontent.com/**', lambda r: r.abort())
        return ctx
    _nc, _np, _pc = Browser.new_context, Browser.new_page, BrowserType.launch_persistent_context
    def new_context(self, *a, **k): return _prep(_nc(self, *a, **k))
    def new_page(self, *a, **k):
        pg = _np(self, *a, **k); _prep(pg.context); return pg
    def launch_persistent_context(self, *a, **k): return _prep(_pc(self, *a, **k))
    Browser.new_context, Browser.new_page, BrowserType.launch_persistent_context = new_context, new_page, launch_persistent_context
except Exception as e:
    import sys; print('signup_off patch failed:', e, file=sys.stderr)
