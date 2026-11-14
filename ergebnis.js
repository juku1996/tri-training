// „Wie war's?“: Kennwerte zu einer erledigten Einheit erfassen (Tabelle session_results).
// Welche Werte abgefragt werden, steht im Plan bei der Einheit unter "measure":
//   [{ "key": "time_400", "label": "Zeit für 400 m", "type": "time", "placeholder": "mm:ss" }]
// Gefühl (1–5) und Beschwerden werden immer optional angeboten.

const Ergebnis = (() => {
  let ctx = null;              // { plan, session, onSaved }
  let feeling = null;
  let results = {};            // key: week_start + "|" + session_id → Zeile
  let exEditor = null;         // Übungen bei Krafteinheiten

  // Werte von der Uhr – bei jeder Einheit optional (Schlüssel in values)
  const STD = [
    { key: "duration_min", label: "Dauer", unit: "Min.", ph: "z. B. 45 oder 1:30", kind: "dur" },
    { key: "distance_km", label: "Distanz", unit: "km", ph: "z. B. 8,5", kind: "num", sports: ["swim", "bike", "run"] },
    { key: "elevation_m", label: "Höhenmeter", unit: "hm", ph: "z. B. 350", kind: "int", sports: ["bike", "run"] },
    { key: "avg_hr", label: "Ø Puls", unit: "bpm", ph: "z. B. 142", kind: "int" },
    { key: "calories", label: "Kalorien", unit: "kcal", ph: "z. B. 450", kind: "int" }
  ];
  const isStrength = (s) => s.sport === "strength";
  const stdFor = (s) => {
    const own = new Set((s.measure || []).map((m) => m.key));
    return STD.filter((f) => (!f.sports || f.sports.includes(s.sport)) && !own.has(f.key));
  };
  const fmtDur = (m) => m >= 60 ? Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0") + " h" : m + " Min.";

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
    const v = r.values || {};
    if (v.duration_min) parts.push(fmtDur(v.duration_min));
    if (v.distance_km != null) parts.push(session.sport === "swim" ? Math.round(v.distance_km * 1000) + " m" : String(v.distance_km).replace(".", ",") + " km");
    if (v.elevation_m != null) parts.push(v.elevation_m + " hm");
    if (v.avg_hr) parts.push("Ø " + v.avg_hr + " bpm");
    if (v.calories) parts.push(v.calories + " kcal");
    if (Array.isArray(v.exercises) && v.exercises.length) parts.push(v.exercises.length + (v.exercises.length === 1 ? " Übung" : " Übungen"));
    if (r.feeling) parts.push("Gefühl " + r.feeling + "/5");
    if (r.complaints) parts.push("Beschwerden notiert");
    return parts.join(" · ");
  }

  function open(plan, session, onSaved) {
    ctx = { plan, session, onSaved };
    const r = get(plan.week_start, session.id);
    feeling = r ? r.feeling : null;
    $("res-title").textContent = session.title;
    $("res-sub").textContent = r ? "Deine Werte zu dieser Einheit. Du kannst sie jederzeit ergänzen." : "Erledigt ✓ Magst du kurz festhalten, wie es lief?";
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

    // Werte von der Uhr
    const vals = (r && r.values) || {};
    const std = stdFor(session);
    if (std.length) {
      const h = document.createElement("div"); h.className = "res-h";
      h.textContent = "Werte von deiner Uhr (optional)";
      const grid = document.createElement("div"); grid.className = "wk-grid";
      std.forEach((f) => {
        const wrap = document.createElement("div"); wrap.className = "field q";
        const lab = document.createElement("label"); lab.htmlFor = "res-std-" + f.key; lab.textContent = f.label;
        const row = document.createElement("div"); row.className = "input-unit";
        const inp = document.createElement("input"); inp.type = "text"; inp.id = "res-std-" + f.key;
        inp.dataset.std = f.key; inp.dataset.kind = f.kind;
        const swim = f.key === "distance_km" && session.sport === "swim";
        inp.inputMode = f.kind === "dur" ? "text" : (f.kind === "num" ? "decimal" : "numeric");
        inp.placeholder = f.key === "duration_min" && session.duration_min ? "geplant " + session.duration_min : (swim ? "z. B. 1500" : f.ph);
        let v = vals[f.key];
        if (v != null) v = f.key === "duration_min" && v >= 60 ? Math.floor(v / 60) + ":" + String(v % 60).padStart(2, "0") : (swim ? Math.round(v * 1000) : String(v).replace(".", ","));
        inp.value = v == null ? "" : v;
        if (swim) inp.dataset.swim = "1";
        inp.addEventListener("input", () => { $("res-msg").textContent = ""; });
        const u = document.createElement("span"); u.className = "unit"; u.textContent = swim ? "m" : f.unit;
        row.append(inp, u); wrap.append(lab, row); grid.append(wrap);
      });
      box.append(h, grid);
    }

    // Übungen bei Krafteinheiten
    exEditor = null;
    if (isStrength(session)) {
      const h = document.createElement("div"); h.className = "res-h"; h.textContent = "Übungen (optional)";
      const ex = document.createElement("div");
      box.append(h, ex);
      exEditor = Uebungen.mount(ex, vals.exercises);
    }

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
    document.querySelectorAll("#res-fields input[data-key]").forEach((inp) => {
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
    document.querySelectorAll("#res-fields input[data-std]").forEach((inp) => {
      const raw = inp.value.trim();
      if (!raw || problem) return;
      const k = inp.dataset.std;
      if (inp.dataset.kind === "dur") {
        let m;
        if (/^\d{1,2}:\d{2}$/.test(raw)) { const [h, mm] = raw.split(":").map(Number); m = h * 60 + mm; } else m = Number(raw);
        if (!Number.isInteger(m) || m < 1 || m > 1440) { problem = "Dauer bitte in Minuten (z. B. 45) oder als h:mm (z. B. 1:30)."; return; }
        values[k] = m; return;
      }
      let n = Number(raw.replace(",", "."));
      if (Number.isNaN(n) || n < 0) { problem = "Bitte bei „" + inp.closest(".field").querySelector("label").textContent + "“ eine Zahl eingeben."; return; }
      if (inp.dataset.swim) n = n / 1000;
      if (k === "avg_hr" && (n < 30 || n > 230)) { problem = "Der Puls sollte zwischen 30 und 230 liegen."; return; }
      values[k] = inp.dataset.kind === "int" ? Math.round(n) : Math.round(n * 100) / 100;
    });
    if (!problem && values.duration_min && values.distance_km) {
      const max = { swim: 7, bike: 60, run: 25 }[ctx.session.sport];
      const kmh = values.distance_km / (values.duration_min / 60);
      if (max && kmh > max) problem = "Das wären " + Math.round(kmh) + " km/h. Stimmt die Dauer? Für Stunden bitte h:mm eingeben, z. B. 1:25.";
    }
    if (!problem && exEditor) {
      const ex = exEditor.get();
      if (ex.error) problem = ex.error; else if (ex.list.length) values.exercises = ex.list;
    }
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
