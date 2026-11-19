// 認識テキスト → ○× / 数値 / コマンド の判定（Python版 voice_input.py と同じルール）

export const KEYWORDS = [ // 先に書いたものから順に判定（「異常なし」を×より先に判定）
  ["異常なし", "○"], ["異常無し", "○"], ["以上なし", "○"], ["以上無し", "○"], ["いじょうなし", "○"], ["問題なし", "○"],
  ["異常", "×"], ["いじょう", "×"], ["以上", "×"], ["バツ", "×"], ["ばつ", "×"], ["NG", "×"], ["ダメ", "×"], ["だめ", "×"],
  ["正常", "○"], ["せいじょう", "○"], ["マル", "○"], ["まる", "○"], ["丸", "○"], ["OK", "○"], ["よし", "○"], ["良し", "○"],
];
const COMMANDS = [["戻る", "back"], ["もどる", "back"], ["スキップ", "skip"], ["飛ばす", "skip"], ["とばす", "skip"]];

const KDIG = { "〇": 0, "零": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };
const KUNIT = { "十": 10, "百": 100, "千": 1000 };
const KANA = [["ゼロ", "0"], ["れい", "0"], ["いち", "1"], ["さん", "3"], ["よん", "4"], ["ろく", "6"],
  ["なな", "7"], ["しち", "7"], ["はち", "8"], ["きゅう", "9"], ["に", "2"], ["し", "4"], ["ご", "5"], ["く", "9"]];

const clean = (t) => t.replace(/[\s。、,.!?！？「」]/g, "");

export function judgeMark(text, marks = { ok: "○", ng: "×" }) {
  const t = clean(text);
  for (const [w, m] of KEYWORDS) if (t.includes(w)) return m === "○" ? marks.ok : marks.ng;
  return null;
}

export function command(text) {
  const t = clean(text);
  for (const [w, c] of COMMANDS) if (t.includes(w)) return c;
  return null;
}

function kanjiInt(t) {
  if (t && [...t].every((c) => c in KDIG)) return parseInt([...t].map((c) => KDIG[c]).join(""), 10);
  let total = 0, sect = 0, num = 0;
  for (const c of t) {
    if (c in KDIG) num = KDIG[c];
    else if (c in KUNIT) { sect += (num || 1) * KUNIT[c]; num = 0; }
    else if (c === "万") { total += (sect + num) * 10000; sect = 0; num = 0; }
    else return null;
  }
  return total + sect + num;
}

export function parseNumber(text) {
  let t = text.replace(/[０-９．－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  t = t.replace(/[\s。、,円度個本回番!?！？]/g, "");
  let neg = false;
  for (const w of ["マイナス", "まいなす", "-", "−", "ー"]) {
    if (t.startsWith(w)) { neg = true; t = t.slice(w.length); break; }
  }
  t = t.replace(/てん|テン/g, "点").replace(/ゼロ|れい/g, "〇");
  let val;
  const m = t.match(/^(\d+)(?:[.点](\d+))?$/);
  if (m) {
    val = m[1] + (m[2] ? "." + m[2] : "");
  } else {
    const i = t.indexOf("点");
    const ip = i >= 0 ? t.slice(0, i) : t;
    let dp = i >= 0 ? t.slice(i + 1) : "";
    const n = ip ? kanjiInt(ip) : 0;
    if (n === null || (!ip && !dp)) return null;
    if (dp) {
      for (const [k, v] of KANA) dp = dp.split(k).join(v);
      dp = [...dp].map((c) => (c in KDIG ? String(KDIG[c]) : c)).join("");
      if (!/^\d+$/.test(dp)) return null;
    }
    val = String(n) + (dp ? "." + dp : "");
  }
  return (neg ? "-" : "") + val;
}

export function jumpTarget(text) {
  const t = clean(text).replace(/ばん/g, "番");
  const m = t.match(/(.+?)番/);
  if (!m) return null;
  let num = m[1];
  for (const [k, v] of KANA) num = num.split(k).join(v);
  num = num.replace(/じゅう/g, "十").replace(/ひゃく/g, "百");
  const n = parseNumber(num);
  return n && /^\d+$/.test(n) ? parseInt(n, 10) : null;
}

// 発話を1つの動作に変換: {kind:"value"|"back"|"skip"|"jump"|"none", value?, n?}
export function interpret(text, marks) {
  const j = jumpTarget(text);
  if (j !== null) return { kind: "jump", n: j };
  const c = command(text);
  if (c) return { kind: c };
  const mk = judgeMark(text, marks);
  if (mk) return { kind: "value", value: mk, type: "mark" };
  const n = parseNumber(text);
  if (n !== null) return { kind: "value", value: n, type: "number" };
  return { kind: "none" };
}
