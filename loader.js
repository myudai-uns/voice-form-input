// XC-Gate 音声入力（ブックマーク方式）: ブックマークのクリックでページに読み込まれ、操作パネルを表示する
import { interpret } from "./parse.js";

const BASE = new URL(".", import.meta.url).href;

if (window.__xcgVB) {
  window.__xcgVB.toggle();
} else {
  window.__xcgVB = start();
}

function start() {
  // ---------- 設定（ブラウザに保存。使えない環境でも動くように） ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("xcgvb." + k); return v === null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("xcgvb." + k, v); } catch {} },
  };

  // ---------- 操作パネル（Shadow DOM でページのデザインと干渉させない） ----------
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
<style>
  :host { all: initial; }
  .p { width: 300px; font: 12px/1.5 "Segoe UI","Yu Gothic UI",sans-serif; color:#1d2330; background:#fff;
       border:1px solid #d6dae0; border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,.18); overflow:hidden; }
  .h { display:flex; align-items:center; gap:6px; padding:8px 10px; background:#1d2330; color:#fff; cursor:move; user-select:none; }
  .h b { flex:1; font-size:13px; }
  .h button { background:transparent; color:#fff; border:0; font-size:14px; cursor:pointer; padding:0 4px; }
  .b { padding:8px 10px; }
  .row { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:4px 0; }
  label { color:#6b7280; }
  select, input[type=text] { font:inherit; padding:2px 4px; border:1px solid #d6dae0; border-radius:4px; max-width:100%; }
  input[type=text] { width:34px; text-align:center; }
  button.btn { font:inherit; padding:4px 10px; border:0; border-radius:5px; background:#e5e7eb; color:#1d2330; cursor:pointer; }
  button.big { width:100%; padding:8px; font-size:14px; background:#ff7a00; color:#fff; }
  button.big.on { background:#dc2626; }
  button:disabled { opacity:.4; cursor:default; }
  .st { font-weight:700; }
  .meter { position:relative; height:8px; background:#e5e7eb; border-radius:4px; overflow:hidden; margin:6px 0; }
  .meter i { position:absolute; left:0; top:0; bottom:0; width:0; background:#16a34a; }
  .meter s { position:absolute; top:0; bottom:0; width:2px; background:#dc2626; }
  .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:3px; text-align:center; margin-top:6px; }
  .stats div { background:#f3f4f6; border-radius:4px; padding:2px; }
  .stats b { display:block; font-size:14px; }
  .log { max-height:130px; overflow:auto; font-size:11px; margin-top:6px; border-top:1px solid #eee; }
  .log div { padding:2px 0; border-bottom:1px dashed #eee; }
  .ok { font-weight:700; } .ign { color:#6b7280; } .err { color:#dc2626; }
  details summary { cursor:pointer; color:#6b7280; margin-top:4px; }
  .min .b { display:none; }
</style>
<div class="p">
  <div class="h"><b>🎤 音声入力（試作）</b><button id="min" title="最小化">–</button><button id="close" title="閉じる">×</button></div>
  <div class="b">
    <div class="row">
      <label>モデル</label>
      <select id="model"><option value="tiny">tiny</option><option value="base">base</option><option value="small">small</option></select>
      <label>処理</label>
      <select id="device"><option value="auto">自動</option><option value="webgpu">WebGPU</option><option value="wasm">CPU</option></select>
    </div>
    <div class="row"><button class="btn" id="load">モデル読み込み</button><span id="li" style="flex:1"></span></div>
    <button class="btn big" id="mic" disabled>🎤 開始</button>
    <div class="row"><span class="st" id="st">モデルを読み込んでください</span></div>
    <div class="row"><span id="fd">入力欄: 最初の欄をクリック</span></div>
    <div class="meter"><i id="lv"></i><s id="th"></s></div>
    <details>
      <summary>設定（マイク・感度・文字）</summary>
      <div class="row"><label>マイク</label><select id="micdev" style="flex:1;min-width:0"><option value="">既定のマイク</option></select></div>
      <div class="row"><button class="btn" id="micref">マイク一覧を更新</button></div>
      <div class="row"><label>感度</label><input id="sens" type="range" min="2" max="60" style="flex:1"><span id="sv"></span></div>
      <div class="row"><label>○</label><input id="okc" type="text"><label>×</label><input id="ngc" type="text">
        <label><input id="dry" type="checkbox">入力しない(精度テスト)</label></div>
    </details>
    <div class="stats"><div><b id="sN">0</b>発話</div><div><b id="sV">0</b>入力</div><div><b id="sI">0</b>無視</div><div><b id="sM">-</b>平均ms</div></div>
    <div class="row"><button class="btn" id="copy">記録コピー</button><button class="btn" id="clr">クリア</button></div>
    <div class="log" id="log"></div>
  </div>
</div>`;
  document.documentElement.appendChild(host);
  const $ = (id) => root.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // パネルのボタンを押しても、帳票の欄からカーソルが外れないようにする
  root.addEventListener("mousedown", (e) => {
    const t = e.composedPath()[0];
    if (!(t instanceof Element) || !t.closest("select,input,summary,.log")) e.preventDefault();
  });

  // ドラッグで移動
  (() => {
    let sx, sy, ox, oy;
    $("min").parentElement.addEventListener("pointerdown", (e) => {
      if (e.target.tagName === "BUTTON") return;
      sx = e.clientX; sy = e.clientY;
      const r = host.getBoundingClientRect(); ox = r.left; oy = r.top;
      const mv = (ev) => {
        host.style.left = ox + ev.clientX - sx + "px"; host.style.top = oy + ev.clientY - sy + "px";
        host.style.right = "auto"; host.style.bottom = "auto";
      };
      const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
      addEventListener("pointermove", mv); addEventListener("pointerup", up);
    });
  })();
  $("min").onclick = () => root.querySelector(".p").classList.toggle("min");

  // 設定の復元
  $("model").value = store.get("model", "base");
  $("device").value = store.get("device", "auto");
  $("sens").value = store.get("sens", "10");
  $("okc").value = store.get("okc", "○");
  $("ngc").value = store.get("ngc", "×");
  for (const k of ["model", "device", "sens", "okc", "ngc"]) $(k).addEventListener("change", () => store.set(k, $(k).value));
  const threshold = () => Number($("sens").value) / 1000;
  const showSens = () => { $("sv").textContent = threshold().toFixed(3); $("th").style.left = Math.min(100, threshold() * 1000) + "%"; };
  $("sens").addEventListener("input", showSens); showSens();

  // ---------- 記録 ----------
  const stats = { n: 0, v: 0, i: 0, ms: [] }, records = [];
  function log(html, cls = "") {
    const d = document.createElement("div"); d.className = cls;
    d.innerHTML = `${new Date().toLocaleTimeString()} ${html}`;
    $("log").prepend(d);
    while ($("log").children.length > 60) $("log").lastChild.remove();
  }
  function upd() {
    $("sN").textContent = stats.n; $("sV").textContent = stats.v; $("sI").textContent = stats.i;
    $("sM").textContent = stats.ms.length ? Math.round(stats.ms.reduce((a, b) => a + b, 0) / stats.ms.length) : "-";
  }
  $("clr").onclick = () => { stats.n = stats.v = stats.i = 0; stats.ms = []; records.length = 0; $("log").innerHTML = ""; upd(); };
  $("copy").onclick = async () => {
    const t = "時刻\t認識テキスト\t判定\t処理ms\n" + records.map((r) => [r.time, r.text, r.result, r.ms].join("\t")).join("\n");
    try { await navigator.clipboard.writeText(t); log("記録をコピーしました"); } catch { log("コピーできませんでした", "err"); }
  };

  // ---------- 帳票の欄の特定・入力（ページ本体＋同じドメインのフレーム） ----------
  const SEL = [
    'input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=reset])' +
      ':not([type=image]):not([type=file]):not([disabled]):not([readonly])',
    "textarea:not([disabled]):not([readonly])", "select:not([disabled])",
    '[contenteditable=""],[contenteditable="true"]',
  ].join(",");
  let current = null;
  const hooked = new WeakSet();

  function allDocs(doc = document, out = []) {
    out.push(doc);
    for (const f of doc.querySelectorAll("iframe,frame")) {
      try { if (f.contentDocument) allDocs(f.contentDocument, out); } catch {}  // 別ドメインのフレームは対象外
    }
    return out;
  }
  function hookDocs() {
    for (const d of allDocs()) {
      if (hooked.has(d)) continue;
      hooked.add(d);
      d.addEventListener("focusin", (e) => {
        const el = e.target;
        if (el instanceof d.defaultView.Element && el.matches(SEL) && !host.contains(el)) { mark(el); showField(info(el)); }
      }, true);
    }
  }
  hookDocs();
  const hookTimer = setInterval(hookDocs, 2000);

  const visible = (el) => {
    const r = el.getBoundingClientRect(), s = el.ownerDocument.defaultView.getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  function fields(doc) {
    const all = [...doc.querySelectorAll(SEL)].filter(visible).filter((e) => e.tabIndex >= 0);
    return [...all.filter((e) => e.tabIndex > 0).sort((a, b) => a.tabIndex - b.tabIndex), ...all.filter((e) => e.tabIndex === 0)];
  }
  const label = (el) => (el.getAttribute("aria-label") || el.name || el.id || el.placeholder || el.title || el.tagName).slice(0, 30);
  function mark(el) {
    if (current && current !== el && current.isConnected) current.style.outline = current.dataset.xcgOutline || "";
    if (el) {
      if (!("xcgOutline" in el.dataset)) el.dataset.xcgOutline = el.style.outline || "";
      el.style.outline = "3px solid #ff7a00"; el.style.outlineOffset = "1px";
    }
    current = el;
  }
  function info(el) {
    if (!el) return null;
    const list = fields(el.ownerDocument);
    return { index: list.indexOf(el) + 1, total: list.length, label: label(el) };
  }
  function showField(r) {
    $("fd").innerHTML = r && r.index ? `入力欄: <b>${r.index}/${r.total}</b> ${esc(r.label)}`
      : "入力欄: 最後まで入力済み（直す欄をクリック）";
  }
  function setValue(el, value) {
    const doc = el.ownerDocument, win = doc.defaultView;
    el.focus();
    const fire = (t) => el.dispatchEvent(new win.Event(t, { bubbles: true }));
    if (el.tagName === "SELECT") {
      const opt = [...el.options].find((o) => o.text.trim() === value || o.value === value) || [...el.options].find((o) => o.text.includes(value));
      if (!opt) return false;
      el.value = opt.value; fire("input"); fire("change"); return true;
    }
    if (el.isContentEditable) {
      const r = doc.createRange(); r.selectNodeContents(el);
      const s = win.getSelection(); s.removeAllRanges(); s.addRange(r);
      return doc.execCommand("insertText", false, value);
    }
    el.select?.();
    if (doc.execCommand("insertText", false, value) && el.value === value) { fire("change"); return true; }
    const proto = el.tagName === "TEXTAREA" ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    fire("input"); fire("change"); return true;
  }
  function go(el) {
    if (!el) { mark(null); return; }
    el.focus(); el.scrollIntoView({ block: "center", behavior: "smooth" }); mark(el);
  }
  function target() {
    for (const d of allDocs()) { const a = d.activeElement; if (a && a.matches?.(SEL) && !host.contains(a)) return a; }
    return current && current.isConnected ? current : null;
  }
  function act(a) {
    if (a.kind === "jump") {
      const doc = (target() || {}).ownerDocument || document;
      const t = fields(doc)[a.n - 1];
      if (!t) return { ok: false, error: `${a.n}番の欄はありません` };
      go(t); return { ok: true, msg: `${a.n}欄目へ`, info: info(t) };
    }
    const el = target();
    if (!el) return { ok: false, error: "入力する欄が選ばれていません。最初の欄をクリックしてください" };
    const list = fields(el.ownerDocument), i = list.indexOf(el);
    if (a.kind === "back") { const t = list[Math.max(0, i - 1)]; go(t); return { ok: true, msg: "1つ戻る", info: info(t) }; }
    if (a.kind === "skip") { const t = list[i + 1]; go(t); return { ok: true, msg: "スキップ", info: info(t) }; }
    const filledAt = i + 1;
    if (!setValue(el, a.value)) return { ok: false, error: `「${a.value}」をこの欄に入れられませんでした` };
    const t = list[i + 1]; go(t);
    return { ok: true, msg: `${filledAt}欄目に ${a.value}`, info: info(t) };
  }

  // ---------- Whisper（別スレッド） ----------
  const wurl = URL.createObjectURL(new Blob([`import "${BASE}worker.js";`], { type: "text/javascript" }));
  const worker = new Worker(wurl, { type: "module" });
  let busy = false;
  const progress = {};
  $("load").onclick = () => {
    $("load").disabled = true; $("mic").disabled = true; $("li").textContent = "読み込み中…";
    worker.postMessage({ type: "load", model: $("model").value, device: $("device").value });
  };
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "progress") {
      progress[m.file] = m.pct;
      const vals = Object.values(progress);
      $("li").textContent = `ダウンロード ${Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)}%`;
    } else if (m.type === "ready") {
      $("load").disabled = false; $("mic").disabled = false;
      $("li").textContent = `${m.model}/${m.device === "webgpu" ? "WebGPU" : "CPU×" + m.threads} 準備完了 ${(m.loadMs / 1000).toFixed(1)}秒`;
      $("st").textContent = "「開始」を押してください";
      log(`モデル準備完了: ${m.model} / ${m.device} / スレッド${m.threads}`);
    } else if (m.type === "result") {
      busy = false; handle(m.text, m.ms);
    } else if (m.type === "error") {
      busy = false; $("load").disabled = false;
      $("li").textContent = "エラー"; log("エラー: " + esc(m.message), "err");
    }
  };
  worker.onerror = (e) => { log("ワーカーを起動できません: " + esc(e.message || "読み込み制限の可能性"), "err"); $("load").disabled = false; };

  function handle(text, ms) {
    stats.n++; stats.ms.push(ms);
    const a = interpret(text, { ok: $("okc").value, ng: $("ngc").value });
    let result = "無視", cls = "ign";
    if (a.kind === "none") stats.i++;
    else if ($("dry").checked) { result = a.kind === "value" ? a.value : a.kind + (a.n || ""); stats.v++; cls = "ok"; }
    else {
      const r = act(a);
      if (r.ok) { stats.v++; cls = "ok"; result = r.msg; showField(r.info); beep(a.value === $("ngc").value ? 440 : 880); }
      else { cls = "err"; result = r.error; }
    }
    log(`[${ms}ms]「${esc(text)}」→ ${esc(result)}`, cls);
    records.push({ time: new Date().toLocaleTimeString(), text, result, ms });
    upd();
    if (running) $("st").textContent = "🎤 話してください";
  }

  // ---------- マイク ----------
  const SR = 16000, BLOCK = 2048, BSEC = BLOCK / SR, END_SIL = 0.4, MAX_SEC = 3.0, PRE = 2;
  let ctx = null, stream = null, proc = null, running = false;

  async function listMics() {
    const sel = $("micdev"), saved = store.get("micdev", "");
    let devs = [];
    try { devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput"); } catch {}
    sel.innerHTML = '<option value="">既定のマイク</option>';
    devs.filter((d) => d.deviceId && !["default", "communications"].includes(d.deviceId)).forEach((d, i) => {
      const o = document.createElement("option"); o.value = d.deviceId;
      o.textContent = d.label || `マイク ${i + 1}（開始後に名前を表示）`; sel.appendChild(o);
    });
    sel.value = [...sel.options].some((o) => o.value === saved) ? saved : "";
  }
  listMics();
  navigator.mediaDevices.addEventListener?.("devicechange", listMics);
  $("micref").onclick = () => { listMics(); log("マイク一覧を更新しました"); };
  $("micdev").addEventListener("change", async () => {
    store.set("micdev", $("micdev").value);
    log("マイクを「" + esc($("micdev").selectedOptions[0].textContent) + "」に変更");
    if (running) { stopMic(); await startMic(); }
  });

  $("mic").onclick = () => (running ? stopMic() : startMic());
  async function startMic() {
    const id = $("micdev").value;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: {
        ...(id ? { deviceId: { exact: id } } : {}), channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (err) {
      log(err.name === "NotAllowedError" ? "マイクが許可されていません（アドレスバー左のアイコンから許可）" : "マイクを開けません: " + esc(err.message), "err");
      return;
    }
    log("使用マイク: " + esc(stream.getAudioTracks()[0]?.label || "-"));
    listMics();
    ctx = new AudioContext({ sampleRate: SR });
    const src = ctx.createMediaStreamSource(stream);
    proc = ctx.createScriptProcessor(BLOCK, 1, 1);
    const mute = ctx.createGain(); mute.gain.value = 0;
    src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
    let buf = [], sil = 0, pre = [];
    proc.onaudioprocess = (ev) => {
      const x = new Float32Array(ev.inputBuffer.getChannelData(0));
      let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i];
      const rms = Math.sqrt(s / x.length);
      $("lv").style.width = Math.min(100, rms * 1000) + "%";
      if (busy) { buf = []; sil = 0; return; }
      if (rms > threshold()) { if (!buf.length) buf.push(...pre); buf.push(x); sil = 0; }
      else if (buf.length) { buf.push(x); sil += BSEC; }
      else { pre.push(x); if (pre.length > PRE) pre.shift(); }
      if (buf.length && (sil >= END_SIL || buf.length * BSEC >= MAX_SEC)) {
        const audio = new Float32Array(buf.length * BLOCK);
        buf.forEach((b, i) => audio.set(b, i * BLOCK));
        buf = []; sil = 0; pre = []; busy = true;
        $("st").textContent = "認識中…";
        worker.postMessage({ type: "run", audio }, [audio.buffer]);
      } else if (!busy) $("st").textContent = buf.length ? "聞き取り中…" : "🎤 話してください";
    };
    running = true; $("mic").textContent = "■ 停止"; $("mic").classList.add("on");
  }
  function stopMic() {
    proc?.disconnect(); stream?.getTracks().forEach((t) => t.stop()); ctx?.close();
    ctx = null; running = false; busy = false;
    $("mic").textContent = "🎤 開始"; $("mic").classList.remove("on"); $("st").textContent = "停止中"; $("lv").style.width = "0";
  }
  function beep(f) {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = f; g.gain.value = 0.08; o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.08);
  }

  $("close").onclick = () => {
    stopMic(); worker.terminate(); clearInterval(hookTimer); mark(null); host.remove(); delete window.__xcgVB;
  };
  log("読み込みました。モデル読み込み→開始→最初の欄をクリックして話してください");
  return { toggle: () => { host.style.display = host.style.display === "none" ? "" : "none"; } };
}
