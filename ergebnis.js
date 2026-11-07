// „Wie war's?“: Kennwerte zu einer erledigten Einheit erfassen (Tabelle session_results).
// Welche Werte abgefragt werden, steht im Plan bei der Einheit unter "measure":
//   [{ "key": "time_400", "label": "Zeit für 400 m", "type": "time", "placeholder": "mm:ss" }]
// Gefühl (1–5) und Beschwerden werden immer optional angeboten.

const Ergebnis = (() => {
  let ctx = null;              // { plan, session, onSaved }
  let feeling = null;
  let results = {};            // key: week_start + "|" + session_id → Zeile

  const keyOf = (ws, sid) => ws + "|" + sid;

  async function loadFor(weekStarts) {
    results = {};
    if (!me || !weekStarts.length) return results;
    const { data } = await db.from("session_results")
      .select("week_start, session_id, values, feeling, complaints")
      .eq("user_id", me.id).in("week_start", weekStarts);
    (data || []).forEach((r) => { results[keyOf(r.week_start, r.session_id)] = r; });
    return results;
  }

  const get = (ws, sid) => results[keyOf(ws, sid)] || null;

  // Kurzer Text wie „400 m: 8:12 · Gefühl 4/5“
  function summary(session, r) {
    if (!r) return "";
    const parts = [];
    (session.measure || []).forEach((m) => {
      const v = r.values && r.values[m.key];
      if (v != null && v !== "") parts.push((m.short || m.label) + ": " + v + (m.unit ? " " + m.unit : ""));
    });
    if (r.feeling) parts.push("Gefühl " + r.feeling + "/5");
    if (r.complaints) parts.push("Beschwerden notiert");
    return parts.join(" · ");
  }

  function open(plan, session, onSaved) {
    ctx = { plan, session, onSaved };
    const r = get(plan.week_start, session.id);
    feeling = r ? r.feeling : null;
    $("res-title").textContent = session.title;
    $("res-sub").textContent = "Erledigt ✓ Magst du kurz festhalten, wie es lief?";
    const box = $("res-fields");
    box.innerHTML = "";
    (session.measure || []).forEach((m) => {
      const wrap = document.createElement("div"); wrap.className = "field q";
      const lab = document.createElement("label"); lab.htmlFor = "res-" + m.key; lab.textContent = m.label;
      const row = document.createElement("div"); row.className = "input-unit";
      const inp = document.createElement("input");
      inp.id = "res-" + m.key; inp.type = "text"; inp.dataset.key = m.key; inp.dataset.type = m.type || "text";
      inp.placeholder = m.placeholder || (m.type === "time" ? "mm:ss" : "");
      inp.inputMode = m.type === "number" ? "decimal" : "text";
      inp.value = r && r.values && r.values[m.key] != null ? r.values[m.key] : "";
      inp.addEventListener("input", () => { $("res-msg").textContent = ""; });
      row.append(inp);
      if (m.unit) { const u = document.createElement("span"); u.className = "unit"; u.textContent = m.unit; row.append(u); }
      wrap.append(lab, row);
      if (m.hint) { const h = document.createElement("div"); h.className = "hint"; h.textContent = m.hint; wrap.append(h); }
      box.append(wrap);
    });
    document.querySelectorAll("#res-feeling .chip").forEach((c) => c.setAttribute("aria-pressed", Number(c.dataset.v) === feeling));
    $("res-complaints").value = r && r.complaints ? r.complaints : "";
    $("res-msg").textContent = "";
    $("res-sheet").hidden = false;
  }

  function close() { $("res-sheet").hidden = true; ctx = null; }

  async function save() {
    if (!ctx) return;
    const values = {};
    let problem = null;
    document.querySelectorAll("#res-fields input").forEach((inp) => {
      const v = inp.value.trim();
      if (!v) return;
      if (inp.dataset.type === "time" && !/^\d{1,2}:\d{2}(:\d{2})?$/.test(v)) problem = "Bitte die Zeit im Format mm:ss eingeben, z. B. 8:15.";
      if (inp.dataset.type === "number") {
        const n = parseFloat(v.replace(",", "."));
        if (isNaN(n)) problem = "Bitte eine Zahl eingeben.";
        else { values[inp.dataset.key] = n; return; }
      }
      values[inp.dataset.key] = v;
    });
    if (problem) { $("res-msg").textContent = problem; $("res-msg").className = "msg error"; return; }
    const complaints = $("res-complaints").value.trim() || null;
    if (!Object.keys(values).length && !feeling && !complaints) { close(); return; }
    const row = { user_id: me.id, week_start: ctx.plan.week_start, session_id: ctx.session.id, values, feeling, complaints };
    const btn = $("res-save"); btn.disabled = true;
    const { error } = await db.from("session_results").upsert(row, { onConflict: "user_id,week_start,session_id" });
    btn.disabled = false;
    if (error) { $("res-msg").textContent = translate(error); $("res-msg").className = "msg error"; return; }
    results[keyOf(row.week_start, row.session_id)] = row;
    const cb = ctx.onSaved;
    close();
    if (cb) cb();
  }

  function bind() {
    $("res-save").addEventListener("click", save);
    $("res-skip").addEventListener("click", close);
    $("res-sheet").addEventListener("click", (e) => { if (e.target === $("res-sheet")) close(); });
    document.querySelectorAll("#res-feeling .chip").forEach((c) => c.addEventListener("click", () => {
      const v = Number(c.dataset.v);
      feeling = feeling === v ? null : v;
      document.querySelectorAll("#res-feeling .chip").forEach((x) => x.setAttribute("aria-pressed", Number(x.dataset.v) === feeling));
    }));
  }

  return { bind, open, loadFor, get, summary };
})();
