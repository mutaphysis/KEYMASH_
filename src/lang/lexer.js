// KEYMASH lexer: turns ANY string into tokens. It never throws.

const RE_EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const RE_LETTER = /^[\p{L}\p{M}]+$/u;
const RE_DIGIT = /^\p{Nd}$/u;
const QUOTE_OPEN = new Set(['"', '“', '„', '«', '»', '”', '「']);
const QUOTE_CLOSE = new Set(['"', '”', '“', '»', '«', '」']);
// brackets are never grouped into runs, so they can be matched
const NO_RUN = new Set(['(', ')', '[', ']', '{', '}']);
const MATH_OPS = new Set(['+', '-', '*', '/', '^', '%', '×', '÷', 'x', 'X', '·']);

export function graphemes(str) {
  str = String(str ?? '');
  try {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      return Array.from(seg.segment(str), (s) => s.segment);
    }
  } catch (e) { /* fall through */ }
  return Array.from(str);
}

function kind(g) {
  if (g === '\n' || g === '\r' || g === '\r\n' || g === ' ' || g === ' ') return 'nl';
  if (/^\s+$/u.test(g)) return 'space';
  if (RE_EMOJI.test(g)) return 'emoji';
  if (RE_DIGIT.test(g)) return 'digit';
  if (RE_LETTER.test(g)) return 'letter';
  return 'sym';
}

export function digitValue(g) {
  // works for any unicode decimal digit
  const cp = g.codePointAt(0);
  const ascii = cp - 48;
  if (ascii >= 0 && ascii <= 9) return ascii;
  // most unicode digit blocks are contiguous runs of 10 starting at ...0
  return ((cp % 16) + 10) % 10;
}

/**
 * Tokenize into lines of tokens.
 * Returns { gs: string[] (graphemes), lines: Token[][] }
 * Every token has g0,g1 (grapheme index range, exclusive end).
 */
export function lex(src) {
  const gs = graphemes(src);
  const kinds = gs.map(kind);
  const lines = [];
  let cur = [];
  let i = 0;
  const n = gs.length;
  while (i < n) {
    const k = kinds[i];
    const g = gs[i];
    if (k === 'nl') {
      lines.push(cur); cur = []; i++; continue;
    }
    if (k === 'space') {
      let j = i; while (j < n && kinds[j] === 'space') j++;
      cur.push({ t: 'space', n: j - i, g0: i, g1: j });
      i = j; continue;
    }
    if (QUOTE_OPEN.has(g)) {
      let j = i + 1;
      while (j < n && kinds[j] !== 'nl' && !QUOTE_CLOSE.has(gs[j])) j++;
      const text = gs.slice(i + 1, j).join('');
      const end = j < n && QUOTE_CLOSE.has(gs[j]) ? j + 1 : j;
      cur.push({ t: 'quote', text, g0: i, g1: end });
      i = end; continue;
    }
    if (k === 'letter') {
      let j = i; while (j < n && kinds[j] === 'letter') j++;
      // allow inner apostrophes: don't, it's
      while (j + 1 < n && (gs[j] === "'" || gs[j] === '’') && kinds[j + 1] === 'letter') {
        j++; while (j < n && kinds[j] === 'letter') j++;
      }
      const text = gs.slice(i, j).join('');
      cur.push(makeWord(text, i, j, gs));
      i = j; continue;
    }
    if (k === 'digit') {
      let j = i; let s = '';
      while (j < n && kinds[j] === 'digit') { s += digitValue(gs[j]); j++; }
      if (j + 1 < n && (gs[j] === '.' || gs[j] === ',') && kinds[j + 1] === 'digit') {
        s += '.'; j++;
        while (j < n && kinds[j] === 'digit') { s += digitValue(gs[j]); j++; }
      }
      cur.push({ t: 'num', value: Number(s) || 0, text: s, g0: i, g1: j });
      i = j; continue;
    }
    if (k === 'emoji') {
      let j = i + 1; while (j < n && gs[j] === g) j++;
      cur.push({ t: 'emoji', ch: g, n: j - i, g0: i, g1: j });
      i = j; continue;
    }
    // symbol (anything else)
    let j = i + 1;
    if (!NO_RUN.has(g)) while (j < n && gs[j] === g) j++;
    cur.push({ t: 'sym', ch: g, n: j - i, g0: i, g1: j });
    i = j;
  }
  lines.push(cur);
  return { gs, lines: lines.map(mergeMath) };
}

function makeWord(text, g0, g1, gs) {
  const letters = [];
  for (let k = g0; k < g1; k++) letters.push({ ch: gs[k], g: k });
  const upper = text.toUpperCase();
  const lower = text.toLowerCase();
  const hasCase = upper !== lower;
  const caps = hasCase && text === upper && letters.length >= 2;
  return { t: 'word', text, lower, caps, letters, g0, g1 };
}

// ---- math -------------------------------------------------------------

function isOpTok(tok) {
  if (!tok) return null;
  if (tok.t === 'sym' && tok.n === 1 && MATH_OPS.has(tok.ch)) return tok.ch;
  if (tok.t === 'word' && (tok.text === 'x' || tok.text === 'X')) return '*';
  return null;
}

function normOp(op) {
  return { '×': '*', 'x': '*', 'X': '*', '·': '*', '÷': '/' }[op] || op;
}

// merge "num op num (op num)* [=]" sequences into a math token
function mergeMath(toks) {
  const out = [];
  let i = 0;
  const skipSpace = (k) => { while (k < toks.length && toks[k].t === 'space') k++; return k; };
  while (i < toks.length) {
    const t = toks[i];
    if (t.t === 'num') {
      const nums = [t.value]; const ops = []; const parts = [t.text];
      let k = i + 1; let last = i;
      while (true) {
        const a = skipSpace(k);
        const op = isOpTok(toks[a]);
        if (!op) break;
        const b = skipSpace(a + 1);
        if (!toks[b] || toks[b].t !== 'num') break;
        ops.push(normOp(op)); nums.push(toks[b].value); parts.push(normOp(op), toks[b].text);
        last = b; k = b + 1;
      }
      if (ops.length) {
        let end = last;
        const e = skipSpace(last + 1);
        let eq = false;
        if (toks[e] && toks[e].t === 'sym' && toks[e].ch === '=') { end = e; eq = true; }
        const value = evalMath(nums, ops);
        out.push({ t: 'math', nums, ops, value, eq, text: parts.join(' '), g0: t.g0, g1: toks[end].g1 });
        i = end + 1; continue;
      }
    }
    out.push(t); i++;
  }
  return out;
}

const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 };
function apply(op, a, b) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return a / b;
    case '%': return a % b;
    case '^': return Math.pow(a, Math.min(b, 1024));
    default: return a;
  }
}

export function evalMath(nums, ops) {
  const vals = [nums[0]]; const st = [];
  const reduce = () => { const b = vals.pop(); const a = vals.pop(); vals.push(apply(st.pop(), a, b)); };
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    while (st.length) {
      const top = st[st.length - 1];
      if (PREC[top] > PREC[op] || (PREC[top] === PREC[op] && op !== '^')) reduce(); else break;
    }
    st.push(op); vals.push(nums[i + 1]);
  }
  while (st.length) reduce();
  return vals[0];
}

export function fmtNum(v) {
  if (Number.isNaN(v)) return '🤯';
  if (v === Infinity) return '∞';
  if (v === -Infinity) return '-∞';
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
  const a = Math.abs(v);
  if (a >= 1e15 || a < 1e-6) return v.toExponential(3);
  return String(Number(v.toPrecision(7)));
}
