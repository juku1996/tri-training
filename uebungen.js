// Übungen für Krafteinheiten (Gym): Übung, Sätze, Wiederholungen, Gewicht.
// Wird im Formular „Training eintragen“ (workouts.exercises) und in „Wie war's?“
// (session_results.values.exercises) benutzt. Format: [{ name, sets, reps, kg }]

const Uebungen = (() => {
  const COMMON = ["Kniebeuge", "Kreuzheben", "Bankdrücken", "Schulterdrücken", "Rudern", "Latzug", "Klimmzüge",
    "Beinpresse", "Ausfallschritte", "Wadenheben", "Beinbeuger", "Beinstrecker", "Hip Thrust", "Bizepscurls",
    "Trizepsdrücken", "Liegestütze", "Plank", "Seitstütz", "Russian Twist", "Rumänisches Kreuzheben"];

  function ensureDatalist(extra) {
    let dl = document.getElementById("ex-names");
    if (!dl) { dl = document.createElement("datalist"); dl.id = "ex-names"; document.body.append(dl); }
    const names = [...new Set([...(extra || []), ...COMMON])];
    dl.innerHTML = "";
    names.forEach((n) => { const o = document.createElement("option"); o.value = n; dl.append(o); });
  }

  // Letzte eingetragene Übungen (freies Training oder Plan-Einheit), neueste zuerst
  async function last() {
    if (!me) return [];
    const [w, r] = await Promise.all([
      db.from("workouts").select("exercises, updated_at").eq("user_id", me.id).not("exercises", "is", null)
        .order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("session_results").select("values, updated_at").eq("user_id", me.id).not("values->exercises", "is", null)
        .order("updated_at", { ascending: false }).limit(1).maybeSingle()
    ]);
    const a = w.data && Array.isArray(w.data.exercises) ? w.data : null;
    const b = r.data && r.data.values && Array.isArray(r.data.values.exercises) ? { exercises: r.data.values.exercises, updated_at: r.data.updated_at } : null;
    if (a && b) return new Date(a.updated_at) > new Date(b.updated_at) ? a.exercises : b.exercises;
    return (a || b || { exercises: [] }).exercises;
  }

  const fmtKg = (v) => v == null ? "" : String(v).replace(".", ",");

  function mount(box, initial) {
    box.innerHTML = "";
    box.className = "ex-box";
    ensureDatalist();
    const rows = document.createElement("div"); rows.className = "ex-rows";
    const msg = document.createElement("div"); msg.className = "hint ex-msg";

    function addRow(e, focus) {
      const r = document.createElement("div"); r.className = "ex-row";
      const mk = (cls, ph, mode, val, label) => {
        const i = document.createElement("input"); i.type = "text"; i.className = cls; i.placeholder = ph;
        i.inputMode = mode; i.value = val == null ? "" : val; i.setAttribute("aria-label", label); return i;
      };
      const name = mk("ex-name", "z. B. Kniebeuge", "text", e && e.name, "Übung");
      name.setAttribute("list", "ex-names"); name.maxLength = 60; name.autocapitalize = "sentences";
      const sets = mk("ex-num", "3", "numeric", e && e.sets, "Sätze");
      const reps = mk("ex-num", "10", "numeric", e && e.reps, "Wiederholungen");
      const kg = mk("ex-num", "", "decimal", e && fmtKg(e.kg), "Gewicht in kg");
      const del = document.createElement("button"); del.type = "button"; del.className = "ex-del"; del.textContent = "×";
      del.setAttribute("aria-label", "Übung entfernen");
      del.addEventListener("click", () => { r.remove(); if (!rows.children.length) addRow(null); });
      const cell = (inp, unit) => { const s = document.createElement("span"); s.className = "ex-cell"; const u = document.createElement("span"); u.textContent = unit; s.append(inp, u); return s; };
      r.append(name, del, cell(sets, "Sätze"), cell(reps, "Wdh."), cell(kg, "kg"));
      rows.append(r);
      if (focus) name.focus();
    }

    const list = Array.isArray(initial) ? initial : [];
    if (list.length) list.forEach((e) => addRow(e)); else addRow(null);

    const btns = document.createElement("div"); btns.className = "ex-btns";
    const add = document.createElement("button"); add.type = "button"; add.className = "secondary"; add.textContent = "＋ Übung";
    add.addEventListener("click", () => addRow(null, true));
    const copy = document.createElement("button"); copy.type = "button"; copy.className = "secondary"; copy.textContent = "Wie letztes Mal";
    copy.addEventListener("click", async () => {
      copy.disabled = true;
      const l = await last();
      copy.disabled = false;
      if (!l.length) { msg.textContent = "Noch keine Übungen gespeichert."; return; }
      msg.textContent = "Übungen vom letzten Mal übernommen. Gewichte bei Bedarf anpassen.";
      rows.innerHTML = "";
      l.forEach((e) => addRow(e));
    });
    btns.append(add, copy);
    box.append(rows, btns, msg);
    last().then((l) => ensureDatalist(l.map((e) => e.name)));

    // Werte auslesen: { list, error }
    return {
      get() {
        const out = [];
        let error = null;
        rows.querySelectorAll(".ex-row").forEach((r) => {
          const [n, s, w, k] = [...r.querySelectorAll("input")].map((i) => i.value.trim());
          if (!n && !s && !w && !k) return;
          if (!n) { error = "Bitte bei jeder Übung den Namen eintragen."; return; }
          const int = (v, max) => { if (!v) return null; const x = Number(v); return Number.isInteger(x) && x >= 0 && x <= max ? x : NaN; };
          const sets = int(s, 50), reps = int(w, 1000);
          const kg = k ? Number(k.replace(",", ".")) : null;
          if (Number.isNaN(sets) || Number.isNaN(reps)) { error = "Sätze und Wiederholungen bitte als ganze Zahl."; return; }
          if (kg != null && (Number.isNaN(kg) || kg < 0 || kg > 500)) { error = "Gewicht bitte in kg zwischen 0 und 500 (leer lassen bei Körpergewicht)."; return; }
          out.push({ name: n.slice(0, 60), sets, reps, kg: kg != null ? Math.round(kg * 10) / 10 : null });
        });
        return { list: out, error };
      }
    };
  }

  // Kurztext „Kniebeuge 3×10 · 60 kg“
  function line(e) {
    const sr = e.sets && e.reps ? e.sets + "×" + e.reps : (e.reps ? e.reps + " Wdh." : (e.sets ? e.sets + " Sätze" : ""));
    return [e.name, sr, e.kg != null ? fmtKg(e.kg) + " kg" : null].filter(Boolean).join(" ");
  }

  return { mount, line, names: ensureDatalist };
})();
