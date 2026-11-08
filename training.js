// Freie Trainings eintragen (Tabelle workouts): jede Sportart, mit Werten.
// Trainings in der Zukunft werden als „geplant“ gespeichert und später abgehakt.

const Training = (() => {
  const SPORTS = [
    { id: "swim", label: "Schwimmen", icon: "🏊", color: "var(--swim)", dist: "m", maxKmh: 7 },
    { id: "bike", label: "Rad", icon: "🚴", color: "var(--bike)", dist: "km", elev: true, maxKmh: 60 },
    { id: "run", label: "Laufen", icon: "🏃", color: "var(--run)", dist: "km", elev: true, maxKmh: 25 },
    { id: "strength", label: "Kraft", icon: "💪", color: "#8b6fd6", dist: null },
    { id: "football", label: "Fußball", icon: "⚽", color: "#4a9a5a", dist: "km" },
    { id: "yoga", label: "Yoga", icon: "🧘", color: "#c77dba", dist: null },
    { id: "hike", label: "Wandern", icon: "🥾", color: "#9a7b4f", dist: "km", elev: true, maxKmh: 12 },
    { id: "racket", label: "Tennis/Padel", icon: "🎾", color: "#b5a12d", dist: null },
    { id: "other", label: "Sonstiges", icon: "✨", color: "var(--muted)", dist: "km" }
  ];
  const sportOf = (id) => SPORTS.find((s) => s.id === id) || SPORTS[SPORTS.length - 1];

  let list = [];
  let editing = null;        // bestehender Eintrag oder null
  let form = {};

  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const todayIso = () => iso(new Date());
  const shift = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return iso(d); };
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  function dayLabel(s) {
    if (s === todayIso()) return "Heute";
    if (s === shift(-1)) return "Gestern";
    if (s === shift(1)) return "Morgen";
    return parse(s).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
  }
  function fmtDur(min) {
    if (!min) return "";
    const h = Math.floor(min / 60), m = min % 60;
    return h ? h + ":" + pad(m) + " h" : m + " Min.";
  }
  function fmtDist(w) {
    if (w.distance_km == null) return "";
    const sp = sportOf(w.sport);
    if (sp.dist === "m") return Math.round(w.distance_km * 1000) + " m";
    return String(Math.round(w.distance_km * 100) / 100).replace(".", ",") + " km";
  }
  function pace(w) {
    if (!w.duration_min || !w.distance_km) return "";
    const sec = w.duration_min * 60;
    if (w.sport === "swim") {
      const per100 = sec / (w.distance_km * 10);
      return Math.floor(per100 / 60) + ":" + pad(Math.round(per100 % 60)) + " /100 m";
    }
    if (w.sport === "run" || w.sport === "hike") {
      const perKm = sec / w.distance_km;
      return Math.floor(perKm / 60) + ":" + pad(Math.round(perKm % 60)) + " /km";
    }
    if (w.sport === "bike") return String(Math.round(w.distance_km / (w.duration_min / 60) * 10) / 10).replace(".", ",") + " km/h";
    return "";
  }

  // ---------- Liste ----------
  async function render() {
    if (!me) return;
    const since = shift(-28);
    const { data, error } = await db.from("workouts")
      .select("id, day, sport, title, status, duration_min, distance_km, elevation_m, calories, avg_hr, feeling, note")
      .eq("user_id", me.id).gte("day", since)
      .order("day", { ascending: false }).order("id", { ascending: false }).limit(40);
    const box = $("workout-list");
    box.innerHTML = "";
    if (error) { box.textContent = translate(error); return; }
    list = data || [];

    // Wochensumme (Mo–So, nur erledigte)
    const n = new Date(); const mon = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
    const thisWeek = list.filter((w) => w.status === "erledigt" && parse(w.day) >= mon);
    const mins = thisWeek.reduce((s, w) => s + (w.duration_min || 0), 0);
    $("workout-sum").textContent = thisWeek.length
      ? "Diese Woche zusätzlich: " + thisWeek.length + (thisWeek.length === 1 ? " Training" : " Trainings") + (mins ? ", " + fmtDur(mins) : "")
      : "";

    if (!list.length) {
      const p = document.createElement("p"); p.className = "hint"; p.style.margin = "8px 0 0";
      p.textContent = "Noch nichts eingetragen. Alles zählt: Fußball, Yoga, Radeln zur Arbeit …";
      box.append(p);
      return;
    }
    const planned = list.filter((w) => w.status === "geplant").sort((a, b) => a.day.localeCompare(b.day));
    const done = list.filter((w) => w.status === "erledigt");
    if (planned.length) box.append(head("Vorgemerkt"), ...planned.map(row));
    if (done.length) box.append(head("Erledigt"), ...done.slice(0, 12).map(row));
  }

  function head(t) { const h = document.createElement("div"); h.className = "plan-day"; h.textContent = t; return h; }

  function row(w) {
    const sp = sportOf(w.sport);
    const el = document.createElement("button");
    el.type = "button"; el.className = "workout-row" + (w.status === "geplant" ? " planned" : "");
    const ic = document.createElement("span"); ic.className = "w-icon"; ic.textContent = sp.icon; ic.style.background = "color-mix(in srgb, " + sp.color + " 18%, transparent)";
    const txt = document.createElement("span"); txt.className = "w-text";
    const t = document.createElement("b"); t.textContent = w.title || sp.label;
    const m = document.createElement("span"); m.className = "w-meta";
    m.textContent = [dayLabel(w.day), fmtDur(w.duration_min), fmtDist(w), w.elevation_m ? w.elevation_m + " hm" : null, pace(w), w.calories ? w.calories + " kcal" : null].filter(Boolean).join(" · ");
    txt.append(t, m);
    el.append(ic, txt);
    if (w.status === "geplant") {
      const g = document.createElement("span"); g.className = "status-pill"; g.textContent = "geplant"; el.append(g);
    }
    el.addEventListener("click", () => open(w));
    return el;
  }

  // ---------- Formular ----------
  function open(w, presetSport) {
    editing = w || null;
    form = w ? { ...w } : { sport: presetSport || "swim", day: todayIso(), status: "erledigt" };
    if (form.sport === "swim" && form.distance_km != null) form.distance_m = Math.round(form.distance_km * 1000);
    $("wk-title-h").textContent = editing ? "Training bearbeiten" : "Training eintragen";
    $("wk-delete").hidden = !editing;
    $("wk-msg").textContent = "";
    drawSports(); drawDays(); fill();
    $("wk-sheet").hidden = false;
  }
  function close() { $("wk-sheet").hidden = true; editing = null; }

  function drawSports() {
    const box = $("wk-sports"); box.innerHTML = "";
    SPORTS.forEach((s) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "chip"; b.textContent = s.icon + " " + s.label;
      b.setAttribute("aria-pressed", form.sport === s.id);
      b.addEventListener("click", () => { form.sport = s.id; drawSports(); updateDistField(); });
      box.append(b);
    });
    updateDistField();
  }
  function updateDistField() {
    const sp = sportOf(form.sport);
    $("wk-dist-field").hidden = !sp.dist;
    $("wk-dist-unit").textContent = sp.dist === "m" ? "m" : "km";
    $("wk-dist").placeholder = sp.dist === "m" ? "z. B. 1500" : "z. B. 8,5";
    $("wk-elev-field").hidden = !sp.elev;
  }
  function drawDays() {
    const box = $("wk-days"); box.innerHTML = "";
    [["Gestern", shift(-1)], ["Heute", todayIso()], ["Morgen", shift(1)]].forEach(([l, d]) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "chip"; b.textContent = l;
      b.setAttribute("aria-pressed", form.day === d);
      b.addEventListener("click", () => { form.day = d; $("wk-day").value = d; drawDays(); updateStatusHint(); });
      box.append(b);
    });
  }
  function updateStatusHint() {
    const future = form.day > todayIso();
    $("wk-future").hidden = !future;
    $("wk-values").hidden = future && !editing;
  }
  function fill() {
    $("wk-day").value = form.day;
    $("wk-name").value = form.title || "";
    $("wk-dur").value = form.duration_min ? (form.duration_min >= 60 ? Math.floor(form.duration_min / 60) + ":" + pad(form.duration_min % 60) : String(form.duration_min)) : "";
    $("wk-dur").placeholder = "z. B. 45 oder 1:30";
    const sp = sportOf(form.sport);
    $("wk-dist").value = form.distance_km != null ? (sp.dist === "m" ? Math.round(form.distance_km * 1000) : String(form.distance_km).replace(".", ",")) : "";
    $("wk-kcal").value = form.calories || "";
    $("wk-hr").value = form.avg_hr || "";
    $("wk-elev").value = form.elevation_m != null ? form.elevation_m : "";
    $("wk-note").value = form.note || "";
    document.querySelectorAll("#wk-feeling .chip").forEach((c) => c.setAttribute("aria-pressed", Number(c.dataset.v) === form.feeling));
    $("wk-save").textContent = editing && editing.status === "geplant" ? "Als erledigt speichern" : "Speichern";
    updateStatusHint();
  }

  function parseDuration(v) {
    v = v.trim(); if (!v) return null;
    if (/^\d{1,2}:\d{2}$/.test(v)) { const [h, m] = v.split(":").map(Number); return h * 60 + m; }
    const n = parseInt(v, 10); return isNaN(n) ? NaN : n;
  }
  const num = (v) => { v = v.trim().replace(",", "."); if (!v) return null; const n = Number(v); return isNaN(n) ? NaN : n; };

  async function save() {
    const msg = $("wk-msg");
    const fail = (t) => { msg.textContent = t; msg.className = "msg error"; };
    form.day = $("wk-day").value || todayIso();
    const future = form.day > todayIso();
    const dur = parseDuration($("wk-dur").value);
    if (Number.isNaN(dur) || (dur != null && (dur < 1 || dur > 1440))) return fail("Dauer bitte in Minuten (z. B. 45) oder als h:mm (z. B. 1:30).");
    const sp = sportOf(form.sport);
    let dist = sp.dist ? num($("wk-dist").value) : null;
    if (Number.isNaN(dist)) return fail("Bitte eine gültige Distanz eingeben.");
    if (dist != null && sp.dist === "m") dist = dist / 1000;
    const kcal = num($("wk-kcal").value), hr = num($("wk-hr").value);
    if (Number.isNaN(kcal) || Number.isNaN(hr)) return fail("Kalorien und Puls bitte als Zahl.");
    if (hr != null && (hr < 30 || hr > 230)) return fail("Der Puls sollte zwischen 30 und 230 liegen.");
    const elev = sp.elev ? num($("wk-elev").value) : null;
    if (Number.isNaN(elev) || (elev != null && (elev < 0 || elev > 10000))) return fail("Höhenmeter bitte als Zahl zwischen 0 und 10.000.");
    // Plausibilität: passt die Dauer zur Distanz?
    if (dur && dist && sp.maxKmh && dist / (dur / 60) > sp.maxKmh) {
      return fail("Das wären " + Math.round(dist / (dur / 60)) + " km/h. Stimmt die Dauer? Für Stunden bitte h:mm eingeben, z. B. 1:25.");
    }
    if (!future && !dur) return fail("Bitte trag noch ein, wie lange du trainiert hast.");

    const row = {
      user_id: me.id, day: form.day, sport: form.sport,
      title: $("wk-name").value.trim() || null,
      status: future ? "geplant" : "erledigt",
      duration_min: dur, distance_km: dist, calories: kcal != null ? Math.round(kcal) : null,
      avg_hr: hr != null ? Math.round(hr) : null, feeling: form.feeling || null,
      elevation_m: elev != null ? Math.round(elev) : null,
      note: $("wk-note").value.trim() || null
    };
    const btn = $("wk-save"); btn.disabled = true;
    const q = editing ? db.from("workouts").update(row).eq("id", editing.id) : db.from("workouts").insert(row);
    const { error } = await q;
    btn.disabled = false;
    if (error) return fail(translate(error));
    close();
    render();
    if (typeof Plan !== "undefined") Plan.renderToday();
  }

  async function remove() {
    if (!editing || !confirm("Dieses Training löschen?")) return;
    const { error } = await db.from("workouts").delete().eq("id", editing.id);
    if (error) { $("wk-msg").textContent = translate(error); $("wk-msg").className = "msg error"; return; }
    close(); render();
  }

  function bind() {
    document.querySelectorAll("[data-add-workout]").forEach((b) => b.addEventListener("click", () => open(null)));
    $("wk-save").addEventListener("click", save);
    $("wk-cancel").addEventListener("click", close);
    $("wk-delete").addEventListener("click", remove);
    $("wk-sheet").addEventListener("click", (e) => { if (e.target === $("wk-sheet")) close(); });
    $("wk-day").addEventListener("change", () => { form.day = $("wk-day").value; drawDays(); updateStatusHint(); });
    document.querySelectorAll("#wk-feeling .chip").forEach((c) => c.addEventListener("click", () => {
      const v = Number(c.dataset.v); form.feeling = form.feeling === v ? null : v;
      document.querySelectorAll("#wk-feeling .chip").forEach((x) => x.setAttribute("aria-pressed", Number(x.dataset.v) === form.feeling));
    }));
    $("wk-sheet").querySelectorAll("input").forEach((i) => i.addEventListener("input", () => { $("wk-msg").textContent = ""; }));
  }

  return { bind, render, open };
})();
