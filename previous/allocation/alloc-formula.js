/* Prepline: evaluate plated master-copy Excel formulas (subset).
   Supports the patterns found in Plated Entrees/Mains 2026 masters:
   cell refs (A1 / $C$2), numbers, + - * /, parentheses, unary minus, SUM(range).
   Used so totals match master sheet logic when pax changes — not a uniform multiplier. */
(function (root) {
  'use strict';

  const COL = (c) => {
    let n = 0;
    for (let i = 0; i < c.length; i++) n = n * 26 + (c.charCodeAt(i) - 64);
    return n - 1;
  };
  const ADDR = /^(\$?)([A-Z]+)(\$?)(\d+)$/i;

  function parseAddr(a) {
    const m = String(a).trim().match(ADDR);
    if (!m) return null;
    return { c: COL(m[2].toUpperCase()), r: parseInt(m[4], 10) - 1, a: m[2].toUpperCase() + m[4] };
  }

  function tokenize(s) {
    const t = [];
    let i = 0;
    const str = String(s).replace(/^\s*=/, '').trim();
    while (i < str.length) {
      const ch = str[i];
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (/[A-Za-z$]/.test(ch)) {
        let j = i + 1;
        while (j < str.length && /[A-Za-z0-9$]/.test(str[j])) j++;
        const word = str.slice(i, j);
        if (/^SUM$/i.test(word) && str[j] === '(') {
          t.push({ type: 'func', v: 'SUM' });
          i = j;
          continue;
        }
        if (ADDR.test(word.replace(/\$/g, '$'))) {
          // already has $
        }
        if (ADDR.test(word) || /^\$?[A-Z]+\$?\d+$/i.test(word)) {
          t.push({ type: 'ref', v: word.toUpperCase().replace(/\$/g, '') /* store bare for lookup */, raw: word });
          i = j;
          continue;
        }
        throw new Error('unknown token ' + word);
      }
      if (/[0-9.]/.test(ch)) {
        let j = i + 1;
        while (j < str.length && /[0-9.]/.test(str[j])) j++;
        t.push({ type: 'num', v: parseFloat(str.slice(i, j)) });
        i = j;
        continue;
      }
      if ('+-*/(),:'.indexOf(ch) >= 0) {
        t.push({ type: 'op', v: ch });
        i++;
        continue;
      }
      throw new Error('bad char ' + ch + ' in ' + str);
    }
    return t;
  }

  function evalTokens(tokens, get) {
    let p = 0;
    function peek() {
      return tokens[p];
    }
    function take() {
      return tokens[p++];
    }
    function parseExpr() {
      let left = parseTerm();
      while (peek() && peek().type === 'op' && (peek().v === '+' || peek().v === '-')) {
        const op = take().v;
        const right = parseTerm();
        left = op === '+' ? left + right : left - right;
      }
      return left;
    }
    function parseTerm() {
      let left = parseFactor();
      while (peek() && peek().type === 'op' && (peek().v === '*' || peek().v === '/')) {
        const op = take().v;
        const right = parseFactor();
        left = op === '*' ? left * right : left / right;
      }
      return left;
    }
    function parseFactor() {
      const t = peek();
      if (!t) throw new Error('unexpected end');
      if (t.type === 'op' && t.v === '+') {
        take();
        return parseFactor();
      }
      if (t.type === 'op' && t.v === '-') {
        take();
        return -parseFactor();
      }
      if (t.type === 'num') {
        take();
        return t.v;
      }
      if (t.type === 'ref') {
        take();
        const n = get(t.v);
        return n == null || n === '' ? 0 : Number(n);
      }
      if (t.type === 'func' && t.v === 'SUM') {
        take();
        if (!peek() || peek().v !== '(') throw new Error('SUM expects (');
        take();
        // SUM(A1:A3) or SUM(A1,A2)
        let sum = 0;
        if (peek() && peek().type === 'ref') {
          const a = take().v;
          if (peek() && peek().v === ':') {
            take();
            if (!peek() || peek().type !== 'ref') throw new Error('bad range');
            const b = take().v;
            sum = sumRange(a, b, get);
          } else {
            sum = Number(get(a)) || 0;
            while (peek() && peek().v === ',') {
              take();
              if (peek().type === 'ref') sum += Number(get(take().v)) || 0;
              else sum += parseExpr();
            }
          }
        } else {
          sum = parseExpr();
          while (peek() && peek().v === ',') {
            take();
            sum += parseExpr();
          }
        }
        if (!peek() || peek().v !== ')') throw new Error('SUM expects )');
        take();
        return sum;
      }
      if (t.type === 'op' && t.v === '(') {
        take();
        const v = parseExpr();
        if (!peek() || peek().v !== ')') throw new Error('expected )');
        take();
        return v;
      }
      throw new Error('unexpected ' + JSON.stringify(t));
    }
    const v = parseExpr();
    if (p < tokens.length) throw new Error('trailing ' + JSON.stringify(tokens[p]));
    return v;
  }

  function sumRange(a, b, get) {
    const A = parseAddr(a),
      B = parseAddr(b);
    if (!A || !B) return 0;
    let s = 0;
    const r0 = Math.min(A.r, B.r),
      r1 = Math.max(A.r, B.r);
    const c0 = Math.min(A.c, B.c),
      c1 = Math.max(A.c, B.c);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const col =
          (c >= 26 ? String.fromCharCode(64 + Math.floor(c / 26)) : '') + String.fromCharCode(65 + (c % 26));
        // fix multi-col: use encode
        const addr = requireEncode(c, r);
        s += Number(get(addr)) || 0;
      }
    }
    return s;
  }

  function requireEncode(c, r) {
    let s = '';
    let n = c + 1;
    while (n) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s + (r + 1);
  }

  function evalFormula(formula, get) {
    if (formula == null || formula === '') return null;
    const tokens = tokenize(formula);
    return evalTokens(tokens, (ref) => get(String(ref).toUpperCase().replace(/\$/g, '')));
  }

  /** Recalculate all formula cells on a SheetJS worksheet after pax (and other inputs) change.
   *  get/set operate on bare addresses like 'C2'. Returns {ok, values, errors}. */
  function recalcSheet(ws) {
    const cells = {};
    const formulas = [];
    for (const addr of Object.keys(ws)) {
      if (addr[0] === '!') continue;
      const cell = ws[addr];
      if (!cell) continue;
      const bare = addr.toUpperCase();
      if (cell.f) formulas.push({ addr: bare, f: cell.f });
      else if (cell.t === 'n' || typeof cell.v === 'number') cells[bare] = cell.v;
      else if (cell.v != null && cell.v !== '' && !isNaN(Number(cell.v))) cells[bare] = Number(cell.v);
    }
    const get = (ref) => {
      const a = String(ref).toUpperCase().replace(/\$/g, '');
      if (Object.prototype.hasOwnProperty.call(cells, a)) return cells[a];
      // formula not yet computed — try resolve later
      return cells[a];
    };
    const errors = [];
    const values = {};
    // iterate to resolve dependencies (E8 before E4*E8 etc.)
    const pending = formulas.map((x) => ({ ...x }));
    let guard = 0;
    while (pending.length && guard < formulas.length * formulas.length + 5) {
      guard++;
      let progressed = false;
      for (let i = 0; i < pending.length; ) {
        const { addr, f } = pending[i];
        try {
          // dependency check: all refs either non-formula or already in cells
          const refs = [];
          tokenize(f).forEach((t) => {
            if (t.type === 'ref') refs.push(t.v.toUpperCase().replace(/\$/g, ''));
          });
          const blocked = refs.some((r) => {
            if (Object.prototype.hasOwnProperty.call(cells, r)) return false;
            return formulas.some((ff) => ff.addr === r && !Object.prototype.hasOwnProperty.call(cells, r));
          });
          // allow if we can still eval (missing → 0); only block if ref is a pending formula
          const pendingAddrs = new Set(pending.map((p) => p.addr));
          const wait = refs.some((r) => pendingAddrs.has(r) && r !== addr);
          if (wait) {
            i++;
            continue;
          }
          const v = evalFormula(f, get);
          cells[addr] = v;
          values[addr] = v;
          if (ws[addr]) {
            ws[addr].v = v;
            ws[addr].t = 'n';
            // keep .f
          }
          pending.splice(i, 1);
          progressed = true;
        } catch (e) {
          errors.push({ addr, f, error: String(e.message || e) });
          pending.splice(i, 1);
          progressed = true;
        }
      }
      if (!progressed) {
        // break cycles: evaluate anyway
        for (const { addr, f } of pending.splice(0)) {
          try {
            const v = evalFormula(f, get);
            cells[addr] = v;
            values[addr] = v;
            if (ws[addr]) {
              ws[addr].v = v;
              ws[addr].t = 'n';
            }
          } catch (e) {
            errors.push({ addr, f, error: String(e.message || e) });
          }
        }
      }
    }
    return { ok: errors.length === 0, values, errors };
  }

  const API = { evalFormula, recalcSheet, tokenize, parseAddr };
  root.AllocFormula = API;
  if (typeof module !== 'undefined') module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
