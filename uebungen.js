// Übungen für Krafteinheiten (Gym): Übung, Sätze, Wiederholungen, Gewicht.
// Wird im Formular „Training eintragen“ (workouts.exercises), in „Wie war's?“
// (session_results.values.exercises) und in Gym live benutzt. Format: [{ name, sets, reps, kg }]
// Neue Übungen werden aus einer Auswahl der eigenen bisherigen Übungen gewählt (oder neu eingegeben).

const Uebungen = (() => {
  const NEW = "__neu";
  let histPromise = null;

  const keyOf = (n) => String(n || "").toLowerCase().replace(/[\s\-–_.]/g, "");
  const fmtKg = (v) => v == null || v === "" ? "" : String(v).replace(".", ",");

  // Eigene bisherige Übungen: { map: key → letzter Eintrag, list: [Einträge alphabetisch], lastList }
  function history(force) {
    if (histPromise && !force) return histPromise;
    histPromise = (async () => {
      if (!me) return { map: {}, list: [], lastList: [] };
      const [w, r] = await Promise.all([
        db.from("workouts").select("exercises, updated_at").eq("user_id", me.id).not("exercises", "is", null)
          .order("updated_at", { ascending: false }).limit(60),
        db.from("session_results").select("values, updated_at").eq("user_id", me.id).not("values->exercises", "is", null)
          .order("updated_at", { ascending: false }).limit(60)
      ]);
      const rows = [...(w.data || []).map((x) => ({ t: x.updated_at, ex: x.exercises })),
                    ...(r.data || []).map((x) => ({ t: x.updated_at, ex: x.values && x.values.exercises }))]
        .filter((x) => Array.isArray(x.ex)).sort((a, b) => new Date(b.t) - new Date(a.t));
      const map = {};
      rows.forEach((x) => x.ex.forEach((e) => { const k = keyOf(e.name); if (k && !map[k]) map[k] = e; }));
      const list = Object.values(map).sort((a, b) => a.name.localeCompare(b.name, "de"));
      return { map, list, lastList: rows.length ? rows[0].ex : [] };
    })();
    return histPromise;
  }
  const refresh = () => history(true);

  // Übungen aus dem Text einer Plan-Einheit lesen (für ältere Pläne ohne Feld "exercises")
  function fromDetails(details) {
    if (!Array.isArray(details)) return [];
    let rounds = null;
    const out = [];
    const clean = (n) => n.replace(/\s*\(.*$/, "")
      .replace(/\s+(je|pro)\s+(Seite|Bein|Arm)\b.*$/i, "")
      .replace(/\s+(oder|an der|an|am|im|in der|in)\s+.*$/i, "")
      .replace(/[.,;:]+$/, "").trim();
    details.forEach((line) => {
      const r = String(line).match(/(\d+)\s*Runden?/i);
      if (r) rounds = Number(r[1]);
      const body = line.includes(":") ? line.slice(line.indexOf(":") + 1) : line;
      body.split(/,\s*|\s+\+\s+/).forEach((part) => {
        part = part.trim();
        let m;
        if ((m = part.match(/^(\d+)\s*[×x]\s*(\d+)\s*(Sek\.?|s)?\s+(.+)$/i))) out.push({ name: clean(m[4]), sets: +m[1], reps: m[3] ? null : +m[2] });
        else if ((m = part.match(/^(\d+)\s*[×x]\s+(.+)$/))) out.push({ name: clean(m[2]), sets: rounds || 3, reps: +m[1] });
        else if ((m = part.match(/^(?:je\s+)?\d+(?:[–-]\d+)?\s*(?:Sek\.?|s)\s+(.+)$/i))) out.push({ name: clean(m[1]), sets: rounds || 1, reps: null });
        else if (rounds && (m = part.match(/^(\d+)\s+([A-ZÄÖÜ].+)$/)) && !/^Runde/i.test(m[2])) out.push({ name: clean(m[2]), sets: rounds, reps: +m[1] });
      });
    });
    const seen = new Set();
    return out.filter((e) => {
      const k = keyOf(e.name);
      if (!e.name || e.name.length > 40 || /^(pause|runde|min)/i.test(e.name) || seen.has(k)) return false;
      seen.add(k); return true;
    }).slice(0, 15);
  }

  // Übungen einer Plan-Einheit: strukturiert oder aus dem Text
  const forSession = (s) => s && Array.isArray(s.exercises) && s.exercises.length ? s.exercises : fromDetails(s && s.details);

  // Namensfeld: hat die Übung schon einen Namen → Textfeld; sonst Auswahl der eigenen Übungen + „Neue Übung“
  function nameField(current, onPick, onType, cls) {
    const wrap = document.createElement("span"); wrap.className = "ex-namewrap " + (cls || "");
    const asInput = (val, focus) => {
      wrap.innerHTML = "";
      const i = document.createElement("input"); i.type = "text"; i.className = "ex-name"; i.maxLength = 60;
      i.placeholder = "Name der Übung"; i.value = val || ""; i.autocapitalize = "sentences";
      i.setAttribute("aria-label", "Übung");
      i.addEventListener("change", () => onType && onType(i.value.trim()));
      wrap.append(i);
      if (focus) i.focus();
    };
    if (current) { asInput(current); return wrap; }
    const sel = document.createElement("select"); sel.className = "ex-name ex-select"; sel.setAttribute("aria-label", "Übung auswählen");
    const o0 = document.createElement("option"); o0.value = ""; o0.textContent = "Übung auswählen …"; o0.disabled = true; o0.selected = true;
    sel.append(o0);
    wrap.append(sel);
    history().then((h) => {
      h.list.forEach((e) => {
        const o = document.createElement("option"); o.value = keyOf(e.name);
        o.textContent = e.name + (line(e) !== e.name ? " · zuletzt " + line(e).slice(e.name.length + 1) : "");
        sel.append(o);
      });
      const on = document.createElement("option"); on.value = NEW; on.textContent = "＋ Neue Übung eingeben";
      sel.append(on);
      sel.addEventListener("change", () => {
        if (sel.value === NEW) { asInput("", true); return; }
        const e = h.map[sel.value];
        if (e) { asInput(e.name); onPick && onPick(e); }
      });
    });
    return wrap;
  }

  function mount(box, initial) {
    box.innerHTML = "";
    box.className = "ex-box";
    const rows = document.createElement("div"); rows.className = "ex-rows";
    const msg = document.createElement("div"); msg.className = "hint ex-msg";

    function addRow(e) {
      const r = document.createElement("div"); r.className = "ex-row";
      const mk = (cls, ph, mode, val, label) => {
        const i = document.createElement("input"); i.type = "text"; i.className = cls; i.placeholder = ph;
        i.inputMode = mode; i.value = val == null ? "" : val; i.setAttribute("aria-label", label); return i;
      };
      const sets = mk("ex-num", "3", "numeric", e && e.sets, "Sätze");
      const reps = mk("ex-num", "10", "numeric", e && e.reps, "Wiederholungen");
      const kg = mk("ex-num", "", "decimal", e && fmtKg(e.kg), "Gewicht in kg");
      const name = nameField(e && e.name, (p) => {
        if (!sets.value && p.sets) sets.value = p.sets;
        if (!reps.value && p.reps) reps.value = p.reps;
        if (!kg.value && p.kg != null) kg.value = fmtKg(p.kg);
      });
      const del = document.createElement("button"); del.type = "button"; del.className = "ex-del"; del.textContent = "×";
      del.setAttribute("aria-label", "Übung entfernen");
      del.addEventListener("click", () => { r.remove(); if (!rows.children.length) addRow(null); });
      const cell = (inp, unit) => { const s = document.createElement("span"); s.className = "ex-cell"; const u = document.createElement("span"); u.textContent = unit; s.append(inp, u); return s; };
      r.append(name, del, cell(sets, "Sätze"), cell(reps, "Wdh."), cell(kg, "kg"));
      rows.append(r);
    }

    const list = Array.isArray(initial) ? initial : [];
    if (list.length) list.forEach((e) => addRow(e)); else addRow(null);

    const btns = document.createElement("div"); btns.className = "ex-btns";
    const add = document.createElement("button"); add.type = "button"; add.className = "secondary"; add.textContent = "＋ Übung";
    add.addEventListener("click", () => addRow(null));
    const copy = document.createElement("button"); copy.type = "button"; copy.className = "secondary"; copy.textContent = "Wie letztes Mal";
    copy.addEventListener("click", async () => {
      copy.disabled = true;
      const h = await history();
      copy.disabled = false;
      if (!h.lastList.length) { msg.textContent = "Noch keine Übungen gespeichert."; return; }
      msg.textContent = "Übungen vom letzten Mal übernommen. Gewichte bei Bedarf anpassen.";
      rows.innerHTML = "";
      h.lastList.forEach((e) => addRow(e));
    });
    btns.append(add, copy);
    box.append(rows, btns, msg);

    return {
      get() {
        const out = [];
        let error = null;
        rows.querySelectorAll(".ex-row").forEach((r) => {
          const nEl = r.querySelector("input.ex-name");
          const n = nEl ? nEl.value.trim() : "";
          const [s, w, k] = [...r.querySelectorAll("input.ex-num")].map((i) => i.value.trim());
          if (!n && !s && !w && !k) return;
          if (!n) { error = "Bitte bei jeder Übung eine Übung auswählen oder einen Namen eingeben."; return; }
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

  // Kurztext „Kniebeuge 3×10 60 kg“
  function line(e) {
    const sr = e.sets && e.reps ? e.sets + "×" + e.reps : (e.reps ? e.reps + " Wdh." : (e.sets ? e.sets + " Sätze" : ""));
    return [e.name, sr, e.kg != null ? fmtKg(e.kg) + " kg" : null].filter(Boolean).join(" ");
  }

  return { mount, line, history, refresh, keyOf, nameField, forSession, fromDetails };
})();
