/*
 * Softworks chat widget. Embed with:
 *   <script src="https://YOUR-HOST/widget.js" data-api="https://YOUR-HOST"
 *           data-site="https://www.your-site.com" data-turnstile-sitekey="..." defer></script>
 * All message text is rendered with textContent; nothing from the server is parsed as HTML.
 */
(function () {
  "use strict";
  var script = document.currentScript;
  var API = (script && script.dataset.api) || (script && script.src ? new URL(script.src).origin : "");
  var SITE = ((script && script.dataset.site) || "").replace(/\/$/, "");
  var SITEKEY = script && script.dataset.turnstileSitekey;
  var START_OPEN = script && script.dataset.open === "true";

  var WELCOME = "Hi, welcome to Softworks Technologies! 👋 I can help you explore our Services, Products (Zerra & Zenith), Case Studies and Careers. What would you like to know?";
  var PLACEHOLDER = "Ask me anything about our company...";
  var TOO_LONG = "Your prompt is too long. Please reduce the character count or try a shorter prompt.";
  var QUICK = [
    { id: "about", label: "About Company", cls: "c1", icon: "info" },
    { id: "services", label: "Services", cls: "c2", icon: "layers" },
    { id: "products", label: "Products", cls: "c3", icon: "box" },
    { id: "careers", label: "Careers", cls: "c4", icon: "user" }
  ];
  var limits = { chars: 500, lines: 30 };

  var svg = function (body, size, extra) {
    return '<svg width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ' + (extra || "") + ">" + body + "</svg>";
  };
  var ICON = {
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    min: '<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" x2="21" y1="10" y2="3"/><line x1="3" x2="10" y1="21" y2="14"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    send: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>'
  };
  var LOGO = '<svg width="54" height="54" viewBox="0 0 54 54" role="img" aria-label="Softworks Technologies logo"><defs><linearGradient id="swlg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2AC4F2"/><stop offset="1" stop-color="#1F5FE0"/></linearGradient></defs><circle cx="27" cy="27" r="25.5" fill="url(#swlg)" stroke="#FFFFFF" stroke-width="2"/><path d="M26 11 C34 9 41 14 41 23 C41 26 43 28 43 29.5 C43 30.5 41.5 31 41.5 32 C41.5 33.5 41 34 39.5 34.5 L39.5 38 C39.5 40.5 37 41.5 35 41.5 L28 41.5 L28 36.5 C21 35 17 30 17 23.5 C17 17 20 12.5 26 11 Z" fill="#FFFFFF"/><g stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" fill="none"><path d="M8 21 H15 L18 24"/><path d="M8 27 H17"/><path d="M8 33 H15 L18 30"/></g><g fill="#FFFFFF"><circle cx="8" cy="21" r="1.8"/><circle cx="8" cy="27" r="1.8"/><circle cx="8" cy="33" r="1.8"/></g><g stroke="#1F5FE0" stroke-width="1.3" stroke-linecap="round" fill="none"><path d="M23 21 H30 L33 18"/><path d="M23 27 H31"/><path d="M24 32 H30"/></g><g fill="#1F5FE0"><circle cx="33" cy="18" r="1.4"/><circle cx="31" cy="27" r="1.4"/></g></svg>';

  var CSS = [
    ":host{all:initial}",
    "*{box-sizing:border-box}",
    "button{font-family:inherit;cursor:pointer}",
    ".root{--panel:#F7F9FC;--head:#EAEEF6;--log:#F6F8FC;--dock:#EFF3F9;--card:#FFFFFF;--line:#D8DFEB;--soft:#E5EAF2;--text:#1B2540;--muted:#5A6785;--sub:#566383;--tealfg:#0A6B78;--tealbg:#F0FAFC;--tealbd:#BFE3E9;--tealbtn:#DDF3F6;--input:#FFFFFF;--inputbd:#D3DAE6;--chip:#FFFFFF;--chipfg:#33405E;--err:#B4233A;--errbg:#FDECEF;--errbd:#F4B9C3;--warn:#8A5A00;--shadow:0 28px 70px rgba(3,10,40,.35),0 2px 8px rgba(3,10,40,.2);",
    "font-family:'Outfit','Poppins',system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--text)}",
    ".root.dark{--panel:#0E1730;--head:#121D3A;--log:#0B1228;--dock:#101A34;--card:#16213F;--line:#25325A;--soft:#25325A;--text:#E8EDFA;--muted:#A3B0D0;--sub:#9AA8CB;--tealfg:#7FE0EE;--tealbg:rgba(20,144,159,.16);--tealbd:rgba(95,227,245,.3);--tealbtn:rgba(20,144,159,.28);--input:#16213F;--inputbd:#2D3C68;--chip:#16213F;--chipfg:#D2DBF2;--err:#FF9AAA;--errbg:rgba(180,35,58,.18);--errbd:rgba(255,154,170,.35);--warn:#FFC766}",
    ".launcher{position:fixed;right:24px;bottom:24px;width:68px;height:68px;border-radius:50%;border:none;padding:0;background:#fff;box-shadow:0 10px 30px rgba(3,10,40,.35);display:flex;align-items:center;justify-content:center;z-index:2147483000}",
    ".launcher:focus-visible,.hbtn:focus-visible,.chip:focus-visible,.q:focus-visible,.send:focus-visible,.link:focus-visible,.copy:focus-visible,.switch:focus-visible,.edit:focus-visible{outline:3px solid #2AA7FF;outline-offset:2px}",
    ".panel{position:fixed;right:24px;bottom:104px;width:500px;max-width:calc(100vw - 32px);height:min(730px,calc(100vh - 128px));border-radius:24px;overflow:hidden;display:flex;flex-direction:column;background:var(--panel);box-shadow:var(--shadow);z-index:2147483000}",
    ".panel[hidden],.launcher[hidden]{display:none}",
    "@media(max-width:520px){.panel{inset:0;width:100%;max-width:none;height:100%;border-radius:0}.launcher{right:16px;bottom:16px}}",
    ".head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 20px 0 24px;height:112px;flex-shrink:0;background:var(--head);border-bottom:1px solid var(--line)}",
    ".brand{display:flex;align-items:center;gap:16px;min-width:0}",
    ".name{font-size:20px;font-weight:700;line-height:1.2;letter-spacing:-.01em}",
    ".tag{margin-top:3px;font-size:14px;font-weight:500;color:var(--tealfg)}",
    ".tools{display:flex;align-items:center;gap:2px}",
    ".hbtn{width:40px;height:40px;padding:0;border:none;border-radius:12px;background:transparent;color:var(--muted);display:flex;align-items:center;justify-content:center}",
    ".hbtn:hover{background:rgba(120,140,180,.18)}",
    ".switch{position:relative;width:56px;height:32px;margin-right:6px;padding:0;border:none;border-radius:16px;background:#CFD7E4}",
    ".dark .switch{background:#2D3C68}",
    ".knob{position:absolute;left:3px;top:3px;width:26px;height:26px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(27,37,64,.25);display:flex;align-items:center;justify-content:center;color:#F59E0B;transition:transform .2s}",
    ".dark .knob{transform:translateX(24px);color:#6C5CE7}",
    ".log{flex:1;min-height:0;overflow-y:auto;padding:20px 22px;background:var(--log);display:flex;flex-direction:column;gap:14px}",
    ".row{max-width:88%}.row.user{align-self:flex-end;max-width:80%}",
    ".bubble{padding:14px 20px 16px;border-radius:20px;background:var(--card);border:1px solid var(--soft);box-shadow:0 6px 18px rgba(27,37,64,.08);font-size:17px;line-height:1.55;overflow-wrap:anywhere}",
    ".bubble p{margin:0}.bubble p+p{margin-top:6px}",
    ".user .bubble{padding:13px 20px;border:none;border-radius:20px 20px 6px 20px;background:linear-gradient(135deg,#2AA7FF 0%,#6C5CE7 100%);box-shadow:0 6px 16px rgba(76,99,235,.25);color:#fff;line-height:1.5;white-space:pre-wrap}",
    ".bubble.err{background:var(--errbg);border-color:var(--errbd);color:var(--err)}",
    ".bhead{display:flex;align-items:center;gap:8px;margin-bottom:8px;color:#14909F}",
    ".tier{padding:2px 8px;border-radius:8px;background:var(--soft);color:var(--sub);font-size:11px;font-weight:600;letter-spacing:.08em}",
    ".card{display:flex;align-items:center;gap:14px;margin-top:12px;padding:12px 14px;border:1px solid var(--soft);border-radius:14px;background:var(--card)}",
    ".card .t{font-size:16px;font-weight:600}.card .s{margin-top:2px;font-size:13px;color:var(--muted)}.card>div{flex:1;min-width:0}",
    ".link{display:inline-flex;align-items:center;height:40px;padding:0 16px;border-radius:10px;background:var(--tealbtn);color:var(--tealfg);font-size:14px;font-weight:600;text-decoration:none}",
    ".src{margin-top:12px}.src h4{margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--sub)}",
    ".pills{display:flex;flex-wrap:wrap;gap:8px}",
    ".pill{display:inline-flex;align-items:center;gap:6px;min-height:30px;padding:0 12px;border-radius:15px;border:1px solid var(--tealbd);background:var(--tealbg);color:var(--tealfg);font-size:13px;font-weight:500;text-decoration:none}",
    ".meta{display:flex;align-items:center;gap:10px;margin-top:10px;padding-left:8px;font-size:12px;color:var(--sub)}",
    ".copy{display:flex;padding:4px;border:none;background:none;color:var(--sub);border-radius:6px}",
    ".chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;padding-left:4px}",
    ".chip{min-height:36px;padding:0 14px;border-radius:18px;border:1px solid var(--inputbd);background:var(--chip);color:var(--chipfg);font-size:14px;font-weight:500}",
    ".chip:hover{border-color:#2AA7FF}",
    ".edit{margin-top:10px;height:36px;padding:0 14px;border-radius:10px;border:1px solid var(--errbd);background:transparent;color:var(--err);font-size:14px;font-weight:600}",
    ".typing{display:inline-flex;gap:5px;padding:16px 20px}.typing i{width:8px;height:8px;border-radius:50%;background:#8B97B5;animation:b 1s infinite}.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}",
    "@keyframes b{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-5px);opacity:1}}",
    "@media(prefers-reduced-motion:reduce){.typing i{animation:none}.knob{transition:none}}",
    ".dock{flex-shrink:0;padding:16px 0 16px 22px;background:var(--dock);border-top:1px solid var(--line)}",
    ".dock h3{display:flex;align-items:center;gap:8px;margin:0 0 12px;font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--sub)}",
    ".dot{width:12px;height:12px;border-radius:50%;background:#FF6B00;box-shadow:0 0 0 3px rgba(255,107,0,.18)}",
    ".qs{display:flex;gap:10px;overflow-x:auto;padding:4px 22px 4px 4px;margin-left:-4px;scrollbar-width:none}.qs::-webkit-scrollbar{display:none}",
    ".q{flex-shrink:0;display:flex;align-items:center;gap:9px;height:44px;padding:0 18px;border:1px solid var(--bd);border-radius:14px;background:var(--bg);color:var(--fg);font-size:15px;font-weight:500}",
    ".q svg{color:var(--ic)}.q[aria-pressed=true]{border-width:2px;border-color:var(--ic);box-shadow:0 0 0 4px color-mix(in srgb,var(--ic) 20%,transparent)}",
    ".c1{--bg:#E1F3F6;--bd:#BFE3E9;--fg:#0A6B78;--ic:#14909F}.c2{--bg:#ECE9FD;--bd:#D5D0F7;--fg:#4A3DC4;--ic:#6C5CE7}.c3{--bg:#FCE8F1;--bd:#F5C7DB;--fg:#B0135A;--ic:#E0407F}.c4{--bg:#F1ECFE;--bd:#DCD3F8;--fg:#5B3FD0;--ic:#7C4DDB}",
    ".dark .c1{--bg:rgba(20,144,159,.2);--bd:rgba(95,227,245,.3);--fg:#8FE6F2;--ic:#5FE3F5}.dark .c2{--bg:rgba(108,92,231,.22);--bd:rgba(160,150,255,.3);--fg:#C4BDFF;--ic:#A096FF}.dark .c3{--bg:rgba(224,64,127,.2);--bd:rgba(255,130,180,.3);--fg:#FFB4D2;--ic:#FF82B4}.dark .c4{--bg:rgba(124,77,219,.22);--bd:rgba(180,150,255,.3);--fg:#D4C2FF;--ic:#B496FF}",
    ".form{flex-shrink:0;padding:14px 22px 20px;background:var(--panel);border-top:1px solid var(--line)}",
    ".fr{display:flex;align-items:flex-end;gap:12px}",
    ".field{flex:1;display:flex;align-items:center;min-height:54px;padding:0 22px;border:1px solid var(--inputbd);border-radius:27px;background:var(--input)}",
    ".field:focus-within{border-color:#2AA7FF;box-shadow:0 0 0 3px rgba(42,167,255,.2)}",
    ".field.over{border-color:var(--err);box-shadow:0 0 0 3px var(--errbg)}",
    "textarea{flex:1;width:100%;max-height:120px;padding:15px 0;border:none;outline:none;resize:none;background:transparent;color:var(--text);font:inherit;font-size:16px;line-height:24px}",
    "textarea::placeholder{color:#66728E}.dark textarea::placeholder{color:#8794B8}textarea:disabled{cursor:not-allowed}",
    ".send{flex-shrink:0;width:48px;height:48px;margin-bottom:3px;padding:0;border:none;border-radius:50%;background:linear-gradient(135deg,#2AA7FF 0%,#6C5CE7 100%);box-shadow:0 6px 16px rgba(76,99,235,.35);color:#fff;display:flex;align-items:center;justify-content:center}",
    ".send:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}",
    ".count{display:flex;justify-content:space-between;gap:12px;margin:8px 8px 0;font-size:12px;color:var(--sub);min-height:16px}",
    ".count span:last-child{white-space:nowrap}",
    ".count.warn{color:var(--warn)}.count.over{color:var(--err);font-weight:600}",
    ".sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}"
  ].join("\n");

  // ---------------------------------------------------------------- state
  var store = {
    get: function (area, k) { try { return JSON.parse(window[area].getItem(k)); } catch (e) { return null; } },
    set: function (area, k, v) { try { window[area].setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  };
  var state = {
    msgs: store.get("sessionStorage", "sw-msgs") || [],
    open: START_OPEN || store.get("sessionStorage", "sw-open") === true,
    dark: store.get("localStorage", "sw-dark") === true,
    selected: null, busy: false, cooldown: 0, session: null
  };
  if (!state.msgs.length) state.msgs.push({ role: "bot", kind: "welcome", text: WELCOME, ts: Date.now() });

  // ---------------------------------------------------------------- dom helpers
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function icon(name, size) { var s = el("span"); s.style.display = "inline-flex"; s.innerHTML = svg(ICON[name], size); return s; }
  function btn(cls, label, iconName, size) {
    var b = el("button", cls); b.type = "button"; b.setAttribute("aria-label", label);
    if (iconName) b.appendChild(icon(iconName, size));
    return b;
  }
  function href(u) { return /^https?:/.test(u) ? u : SITE + u; }
  function fmt(ts) { return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }

  var host = el("div"); host.id = "softworks-chat";
  var shadow = host.attachShadow({ mode: "open" });
  var style = el("style"); style.textContent = CSS; shadow.appendChild(style);
  var root = el("div", "root"); shadow.appendChild(root);

  var launcher = el("button", "launcher"); launcher.type = "button"; launcher.setAttribute("aria-label", "Open chat"); launcher.innerHTML = LOGO.replace('width="54" height="54"', 'width="52" height="52"').replace(/swlg/g, "swlg2");
  var panel = el("section", "panel"); panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Softworks Technologies chat");
  root.appendChild(launcher); root.appendChild(panel);

  // header
  var head = el("div", "head");
  var brand = el("div", "brand"); brand.innerHTML = LOGO;
  var titles = el("div"); var nm = el("div", "name"); nm.appendChild(document.createTextNode("Softworks")); nm.appendChild(document.createElement("br")); nm.appendChild(document.createTextNode("Technologies"));
  titles.appendChild(nm); titles.appendChild(el("div", "tag", "Ask. Explore. Build.")); brand.appendChild(titles);
  var tools = el("div", "tools");
  var sw = el("button", "switch"); sw.type = "button"; var knob = el("span", "knob"); sw.appendChild(knob);
  var bReset = btn("hbtn", "Reset conversation", "reset", 20), bMin = btn("hbtn", "Minimize chat", "min", 20), bClose = btn("hbtn", "Close chat", "close", 20);
  [sw, bReset, bMin, bClose].forEach(function (b) { tools.appendChild(b); });
  head.appendChild(brand); head.appendChild(tools);

  var log = el("div", "log"); log.setAttribute("role", "log"); log.setAttribute("aria-live", "polite");

  var dock = el("div", "dock"); var h3 = el("h3"); h3.appendChild(el("span", "dot")); h3.appendChild(document.createTextNode("Quick actions")); dock.appendChild(h3);
  var qs = el("div", "qs"); dock.appendChild(qs);
  QUICK.forEach(function (q) {
    var b = el("button", "q " + q.cls); b.type = "button"; b.dataset.id = q.id; b.appendChild(icon(q.icon, 18)); b.appendChild(document.createTextNode(q.label));
    b.addEventListener("click", function () { state.selected = q.id; send(q.label, q.id); });
    qs.appendChild(b);
  });

  var form = el("form", "form"); form.noValidate = true;
  var fr = el("div", "fr"); var field = el("div", "field");
  var ta = el("textarea"); ta.rows = 1; ta.placeholder = PLACEHOLDER; ta.setAttribute("aria-label", "Your message"); field.appendChild(ta);
  var sendBtn = btn("send", "Send message", "send", 22); sendBtn.type = "submit";
  fr.appendChild(field); fr.appendChild(sendBtn);
  var count = el("div", "count"); count.setAttribute("aria-live", "polite");
  var countMsg = el("span"), countNum = el("span"); count.appendChild(countMsg); count.appendChild(countNum);
  form.appendChild(fr); form.appendChild(count);
  panel.appendChild(head); panel.appendChild(log); panel.appendChild(dock); panel.appendChild(form);

  // ---------------------------------------------------------------- render
  function botBubble(m) {
    var row = el("div", "row"); var b = el("div", "bubble" + (m.kind === "error" || m.kind === "reject" ? " err" : ""));
    var bh = el("div", "bhead"); bh.appendChild(icon("bot", 18));
    if (m.tier) bh.appendChild(el("span", "tier", m.tier));
    b.appendChild(bh);
    String(m.text).split("\n").forEach(function (line) { b.appendChild(el("p", null, line)); });
    (m.cards || []).forEach(function (c) {
      var card = el("div", "card"); var d = el("div"); d.appendChild(el("div", "t", c.title)); d.appendChild(el("div", "s", c.subtitle));
      var a = el("a", "link", c.cta || "Explore"); a.href = href(c.url); a.target = "_blank"; a.rel = "noopener";
      a.setAttribute("aria-label", (c.cta || "Explore") + " " + c.title);
      card.appendChild(d); card.appendChild(a); b.appendChild(card);
    });
    if (m.sources && m.sources.length) {
      var s = el("div", "src"); s.appendChild(el("h4", null, "Sources")); var p = el("div", "pills");
      m.sources.forEach(function (x) {
        var a = el("a", "pill"); a.href = href(x.url); a.target = "_blank"; a.rel = "noopener"; a.appendChild(icon("link", 14)); a.appendChild(document.createTextNode(x.title)); p.appendChild(a);
      });
      s.appendChild(p); b.appendChild(s);
    }
    if (m.kind === "reject") {
      var e = el("button", "edit", "Edit prompt"); e.type = "button";
      e.addEventListener("click", function () { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
      b.appendChild(e);
    }
    row.appendChild(b);
    var meta = el("div", "meta"); var cp = btn("copy", "Copy message", "copy", 17);
    cp.addEventListener("click", function () {
      var done = function () { cp.replaceChildren(icon("check", 17)); cp.setAttribute("aria-label", "Copied"); setTimeout(function () { cp.replaceChildren(icon("copy", 17)); cp.setAttribute("aria-label", "Copy message"); }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(m.text).then(done, function () {});
    });
    meta.appendChild(cp); meta.appendChild(el("span", null, fmt(m.ts))); row.appendChild(meta);
    return row;
  }

  function render() {
    log.replaceChildren();
    state.msgs.forEach(function (m, i) {
      if (m.role === "user") {
        var r = el("div", "row user"); r.appendChild(el("div", "bubble", m.text)); log.appendChild(r);
      } else {
        var row = botBubble(m); log.appendChild(row);
        if (i === state.msgs.length - 1 && m.chips && m.chips.length && !state.busy) {
          var cs = el("div", "chips");
          m.chips.forEach(function (c) {
            var b = el("button", "chip", c); b.type = "button"; b.addEventListener("click", function () { state.selected = null; send(c); }); cs.appendChild(b);
          });
          row.appendChild(cs);
        }
      }
    });
    if (state.busy) {
      var t = el("div", "row"); var tb = el("div", "bubble typing"); tb.setAttribute("aria-label", "Assistant is typing");
      tb.appendChild(el("i")); tb.appendChild(el("i")); tb.appendChild(el("i")); t.appendChild(tb); log.appendChild(t);
    }
    log.scrollTop = log.scrollHeight;
    qs.querySelectorAll(".q").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.id === state.selected)); b.disabled = state.busy || state.cooldown > 0; });
    var keep = state.msgs.slice(-40); store.set("sessionStorage", "sw-msgs", keep);
  }

  function applyView() {
    root.classList.toggle("dark", state.dark);
    sw.setAttribute("aria-label", state.dark ? "Switch to light mode" : "Switch to dark mode");
    sw.setAttribute("aria-pressed", String(state.dark));
    knob.replaceChildren(icon(state.dark ? "moon" : "sun", 16));
    panel.hidden = !state.open; launcher.hidden = state.open;
    store.set("sessionStorage", "sw-open", state.open);
  }

  function updateInput() {
    var v = ta.value, n = v.length, lines = v.split("\n").length;
    var over = n > limits.chars || lines > limits.lines;
    var warn = !over && n >= limits.chars * 0.9;
    field.classList.toggle("over", over);
    count.className = "count" + (over ? " over" : warn ? " warn" : "");
    countMsg.textContent = over ? TOO_LONG : warn ? "Almost at the limit" : "";
    countNum.textContent = n ? n + " / " + limits.chars + (lines > limits.lines * 0.8 || lines > limits.lines ? "  ·  " + lines + " / " + limits.lines + " lines" : "") : "";
    var blocked = state.busy || state.cooldown > 0;
    ta.disabled = state.cooldown > 0;
    ta.placeholder = state.cooldown > 0 ? "Wait " + state.cooldown + "s to send again..." : PLACEHOLDER;
    sendBtn.disabled = blocked || over || !v.trim();
    ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }

  // ---------------------------------------------------------------- network
  function turnstileToken() {
    if (!SITEKEY) return Promise.resolve(null);
    return new Promise(function (resolve) {
      var go = function () {
        var box = document.createElement("div"); document.body.appendChild(box);
        window.turnstile.render(box, { sitekey: SITEKEY, size: "invisible",
          callback: function (t) { resolve(t); box.remove(); }, "error-callback": function () { resolve(null); box.remove(); } });
      };
      if (window.turnstile) return go();
      var s = document.createElement("script"); s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; s.async = true; s.onload = go; s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
    });
  }

  function ensureSession(force) {
    var s = state.session || store.get("sessionStorage", "sw-session");
    if (!force && s && s.expires_at * 1000 > Date.now() + 30000) { state.session = s; return Promise.resolve(s); }
    return turnstileToken().then(function (tok) {
      return fetch(API + "/v1/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turnstile_token: tok }) });
    }).then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); }).then(function (x) {
      if (!x.r.ok) { var e = new Error(x.j.error && x.j.error.message || "session"); e.body = x.j; e.status = x.r.status; throw e; }
      state.session = x.j; store.set("sessionStorage", "sw-session", x.j);
      if (x.j.limits) { limits.chars = x.j.limits.max_chars; limits.lines = x.j.limits.max_lines; }
      return x.j;
    });
  }

  function post(text, quick, retried) {
    return ensureSession(false).then(function (s) {
      return fetch(API + "/v1/chat", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.session_token }, body: JSON.stringify({ message: text, quick_action: quick || null }) });
    }).then(function (r) {
      if (r.status === 401 && !retried) { return ensureSession(true).then(function () { return post(text, quick, true); }); }
      return r.json().then(function (j) { return { status: r.status, body: j }; });
    });
  }

  function startCooldown(seconds) {
    state.cooldown = seconds;
    var tick = setInterval(function () {
      state.cooldown -= 1;
      if (state.cooldown <= 0) { state.cooldown = 0; clearInterval(tick); render(); ta.focus(); }
      updateInput();
    }, 1000);
  }

  function send(text, quick) {
    text = (text || "").trim();
    if (!text || state.busy || state.cooldown > 0) return;
    if (text.length > limits.chars || text.split("\n").length > limits.lines) { updateInput(); return; }
    var typed = ta.value;
    state.msgs.push({ role: "user", text: text, ts: Date.now() });
    ta.value = ""; state.busy = true; render(); updateInput();
    post(text, quick).then(function (res) {
      var b = res.body;
      if (res.status === 200) {
        b.role = "bot"; b.ts = Date.now(); state.msgs.push(b);
      } else if (res.status === 400 && b.error.code === "too_long") {
        state.msgs.pop(); ta.value = typed || text;
        state.msgs.push({ role: "bot", kind: "reject", text: b.error.message, ts: Date.now() });
      } else if (res.status === 429) {
        var secs = b.error.retry_after || 10;
        state.msgs.push({ role: "bot", tier: "T0", kind: "error", text: b.error.message, ts: Date.now() });
        startCooldown(secs);
      } else {
        state.msgs.push({ role: "bot", kind: "error", text: (b.error && b.error.message) || "Something went wrong. Please try again.", ts: Date.now() });
      }
    }).catch(function (e) {
      var msg = e && e.body && e.body.error ? e.body.error.message : "Something went wrong. Please try again.";
      state.msgs.push({ role: "bot", kind: "error", text: msg, ts: Date.now() });
      if (e && e.status === 429 && e.body.error.retry_after) startCooldown(e.body.error.retry_after);
    }).then(function () { state.busy = false; render(); updateInput(); if (!state.cooldown) ta.focus(); });
  }

  // ---------------------------------------------------------------- events
  function setOpen(v) { state.open = v; applyView(); if (v) { render(); updateInput(); ta.focus(); } else launcher.focus(); }
  function reset() {
    state.msgs = [{ role: "bot", kind: "welcome", text: WELCOME, ts: Date.now() }]; state.selected = null; render();
  }
  launcher.addEventListener("click", function () { setOpen(true); });
  bMin.addEventListener("click", function () { setOpen(false); });
  bClose.addEventListener("click", function () { reset(); setOpen(false); });
  bReset.addEventListener("click", function () { reset(); ta.focus(); });
  sw.addEventListener("click", function () { state.dark = !state.dark; store.set("localStorage", "sw-dark", state.dark); applyView(); });
  ta.addEventListener("input", updateInput);
  ta.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  panel.addEventListener("keydown", function (e) { if (e.key === "Escape") setOpen(false); });
  form.addEventListener("submit", function (e) { e.preventDefault(); state.selected = null; send(ta.value); });

  document.body.appendChild(host);
  applyView(); render(); updateInput();
  if (state.open) ta.focus();
})();
