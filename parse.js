// 認識テキスト → ○× / 数値 / コマンド の判定（Python版 voice_input.py と同じルール）

export const KEYWORDS = [ // 先に書いたものから順に判定（「異常なし」を×より先に判定）
  ["異常なし", "○"], ["異常無し", "○"], ["以上なし", "○"], ["以上無し", "○"], ["いじょうなし", "○"], ["問題なし", "○"],
  ["正常", "○"], ["せいじょう", "○"], // 「せいじょう」は「いじょう」を含むので×より先に判定
  ["異常", "×"], ["いじょう", "×"], ["以上", "×"], ["バツ", "×"], ["ばつ", "×"], ["NG", "×"], ["ダメ", "×"], ["だめ", "×"],
  ["○", "○"], ["〇", "○"], ["◯", "○"], ["×", "×"], ["✕", "×"], ["✖", "×"],
  ["正常", "○"], ["せいじょう", "○"], ["マル", "○"], ["まる", "○"], ["丸", "○"], ["OK", "○"], ["よし", "○"], ["良し", "○"],
];
const COMMANDS = [["戻る", "back"], ["戻っ", "back"], ["もどる", "back"], ["スキップ", "skip"], ["飛ばす", "skip"], ["とばす", "skip"]];

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

const KANA2KANJI = [["じゅう", "十"], ["ひゃく", "百"], ["びゃく", "百"], ["ぴゃく", "百"], ["せん", "千"], ["ぜん", "千"],
  ["ゼロ", "〇"], ["れい", "〇"], ["いち", "一"], ["さん", "三"], ["よん", "四"], ["ろく", "六"], ["なな", "七"], ["しち", "七"],
  ["はち", "八"], ["きゅう", "九"], ["に", "二"], ["ご", "五"], ["く", "九"], ["し", "四"]];

function parseCore(t) {
  let neg = false;
  for (const w of ["マイナス", "まいなす", "-", "−", "ー"]) {
    if (t.startsWith(w)) { neg = true; t = t.slice(w.length); break; }
  }
  t = t.replace(/てん|テン/g, "点").replace(/ゼロ|れい/g, "〇");
  if (!t) return null;
  let val;
  const m = t.match(/^(\d+)(?:[.点](\d+))?$/);
  if (m) {
    val = m[1] + (m[2] ? "." + m[2] : "");
  } else {
    t = t.replace(/\./g, "点");                     // 「十二．五」のような漢数字＋小数点にも対応
    const i = t.indexOf("点");
    const ip = i >= 0 ? t.slice(0, i) : t;
    let dp = i >= 0 ? t.slice(i + 1) : "";
    const n = ip ? kanjiInt(ip) : 0;
    if (n === null || (!ip && !dp)) return null;
    if (dp) {
      let d2 = dp;
      for (const [k, v] of KANA) d2 = d2.split(k).join(v);
      d2 = [...d2].map((c) => (c in KDIG ? String(KDIG[c]) : c)).join("");
      if (!/^\d+$/.test(d2)) {
        const k = kanjiInt(dp);                      // 「三．十四」→ 3.14
        if (k === null) return null;
        d2 = String(k);
      }
      dp = d2;
    }
    val = String(n) + (dp ? "." + dp : "");
  }
  return (neg ? "-" : "") + val;
}

export function parseNumber(text) {
  let t = text.replace(/[０-９．－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  t = t.replace(/[\s。、,円度個本回番!?！？]/g, "");
  if (!t) return null;
  let r = parseCore(t);
  if (r === null) {                                  // ひらがな混じり（じゅう二点ご）は漢数字に直して再判定
    let k = t;
    for (const [a, b] of KANA2KANJI) k = k.split(a).join(b);
    if (k !== t) r = parseCore(k);
  }
  return r;
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
