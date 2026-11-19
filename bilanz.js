// „Deine Bilanz“: Summen aus Plan-Einheiten (abgehakt + Werte) und freien Trainings.
// Nur eigene Daten. Plan-Einheiten ohne eingetragene Dauer zählen mit der geplanten Dauer.

const Bilanz = (() => {
  const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  // Reihenfolge im Diagramm ist geprüft (Farbsehschwäche): Schwimmen, Rad, Kraft, Laufen, Sonstiges
  const CATS = [
    { id: "swim", label: "Schwimmen", color: "var(--c-swim)" },
    { id: "bike", label: "Rad", color: "var(--c-bike)" },
    { id: "strength", label: "Kraft", color: "var(--c-strength)" },
    { id: "run", label: "Laufen", color: "var(--c-run)" },
    { id: "other", label: "Sonstiges", color: "var(--c-other)" }
  ];
  const catOf = (sport) => ["swim", "bike", "strength", "run"].includes(sport) ? sport : "other";

  let entries = [];            // { date, sport, min, km, elev, kcal, vol, planned }
  let range = "week";
  try { range = localStorage.getItem("tri-bilanz-range") || "week"; } catch (e) { /* egal */ }

  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const monday = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const num = (v) => (v == null || v === "" || isNaN(Number(v))) ? null : Number(v);
  const volume = (ex) => (Array.isArray(ex) ? ex : []).reduce((s, e) => {
    if (Array.isArray(e.set_log) && e.set_log.length) return s + e.set_log.reduce((a, x) => a + (num(x.reps) || 0) * (num(x.kg) || 0), 0);
    return s + (num(e.sets) || 0) * (num(e.reps) || 0) * (num(e.kg) || 0);
  }, 0);

  async function load() {
    const [w, p, r] = await Promise.all([
      db.from("workouts").select("day, sport, status, duration_min, distance_km, elevation_m, calories, exercises, replaces").eq("user_id", me.id).eq("status", "erledigt"),
      db.from("training_plans").select("week_start, sessions, done").eq("user_id", me.id),
      db.from("session_results").select("week_start, session_id, values").eq("user_id", me.id)
    ]);
    const res = {};
    const replaced = new Set((w.data || []).filter((x) => x.replaces).map((x) => x.replaces.week_start + "|" + x.replaces.session_id));
    (r.data || []).forEach((x) => { res[x.week_start + "|" + x.session_id] = x.values || {}; });
    entries = [];
    (w.data || []).forEach((x) => entries.push({
      date: x.day, sport: x.sport, min: num(x.duration_min) || 0, km: num(x.distance_km), elev: num(x.elevation_m),
      kcal: num(x.calories), vol: volume(x.exercises)
    }));
    (p.data || []).forEach((pl) => {
      const done = new Set(pl.done || []);
      (pl.sessions || []).forEach((s) => {
        if (!done.has(s.id) || replaced.has(pl.week_start + "|" + s.id)) return;   // Ersatztraining zählt selbst
        const v = res[pl.week_start + "|" + s.id] || {};
        const d = parse(pl.week_start); d.setDate(d.getDate() + Math.max(0, DAYS.indexOf(s.day)));
        entries.push({
          date: iso(d), sport: s.sport, min: num(v.duration_min) || num(s.duration_min) || 0, planned: v.duration_min == null,
          km: num(v.distance_km), elev: num(v.elevation_m), kcal: num(v.calories), vol: volume(v.exercises)
        });
      });
    });
  }

  function from() {
    const now = new Date();
    if (range === "week") return iso(monday(now));
    if (range === "month") return iso(new Date(now.getFullYear(), now.getMonth(), 1));
    return "0000-00-00";
  }

  const fmtNum = (n, dec) => n.toLocaleString("de-DE", { maximumFractionDigits: dec, minimumFractionDigits: 0 });
  const fmtDur = (m) => { m = Math.round(m); const h = Math.floor(m / 60); return h ? h + ":" + pad(m % 60) + " h" : m + " Min."; };

  async function render() {
    const body = $("bilanz-body");
    if (!body || !me) return;
    try { await load(); } catch (e) { body.textContent = translate(e); return; }
    draw();
  }

  function draw() {
    const body = $("bilanz-body");
    body.innerHTML = "";
    document.querySelectorAll("#bilanz-range .chip").forEach((c) => c.setAttribute("aria-pressed", c.dataset.v === range));
    const f = from(), to = iso(new Date());
    const list = entries.filter((e) => e.date >= f && e.date <= to);
    const sum = (fn) => list.reduce((s, e) => s + (fn(e) || 0), 0);
    const km = (sport) => sum((e) => e.sport === sport ? e.km : 0);

    const tiles = [
      { icon: "🏃", v: fmtNum(km("run"), 1), u: "km", l: "gelaufen" },
      { icon: "🚴", v: fmtNum(km("bike"), 1), u: "km", l: "Rad" },
      { icon: "🏊", v: fmtNum(Math.round(km("swim") * 1000), 0), u: "m", l: "geschwommen" },
      { icon: "🔥", v: fmtNum(sum((e) => e.kcal), 0), u: "kcal", l: "verbraucht" },
      { icon: "⏱️", v: fmtDur(sum((e) => e.min)), u: "", l: "Trainingszeit" },
      { icon: "✅", v: String(list.length), u: "", l: list.length === 1 ? "Einheit" : "Einheiten" },
      { icon: "⛰️", v: fmtNum(sum((e) => e.elev), 0), u: "hm", l: "Höhenmeter" },
      { icon: "🏋️", v: fmtNum(Math.round(sum((e) => e.vol)), 0), u: "kg", l: "bewegt im Gym" }
    ];
    const grid = document.createElement("div"); grid.className = "bz-tiles";
    tiles.forEach((t) => {
      const d = document.createElement("div"); d.className = "bz-tile";
      const i = document.createElement("span"); i.className = "bz-icon"; i.textContent = t.icon; i.setAttribute("aria-hidden", "true");
      const v = document.createElement("b"); v.textContent = t.v;
      if (t.u) { const u = document.createElement("small"); u.textContent = " " + t.u; v.append(u); }
      const l = document.createElement("span"); l.className = "bz-label"; l.textContent = t.l;
      d.append(i, v, l); grid.append(d);
    });
    body.append(grid);

    if (!list.length) {
      const p = document.createElement("p"); p.className = "hint"; p.style.margin = "10px 0 0";
      p.textContent = range === "week" ? "Diese Woche ist noch nichts erledigt. Los geht's! 💪" : "Noch nichts erledigt in diesem Zeitraum.";
      body.append(p);
    }
    const plannedOnly = list.some((e) => e.planned);
    const n = document.createElement("p"); n.className = "hint bz-note";
    n.textContent = "Kilometer, Kalorien und Höhenmeter zählen, wo du sie eingetragen hast." + (plannedOnly ? " Ohne eingetragene Dauer zählt die geplante." : "");
    body.append(n);

    weeksChart(body);
    bests(body);
  }

  // Trainingszeit der letzten 8 Wochen, gestapelt nach Sportart
  function weeksChart(body) {
    const h = document.createElement("div"); h.className = "season-h"; h.textContent = "Trainingszeit · letzte 8 Wochen";
    body.append(h);
    const thisMon = monday(new Date());
    const weeks = Array.from({ length: 8 }, (_, i) => { const d = new Date(thisMon); d.setDate(d.getDate() - 7 * (7 - i)); return d; });
    const data = weeks.map((m) => {
      const a = iso(m), e = new Date(m); e.setDate(e.getDate() + 6); const b = iso(e);
      const per = {}; CATS.forEach((c) => { per[c.id] = 0; });
      entries.filter((x) => x.date >= a && x.date <= b).forEach((x) => { per[catOf(x.sport)] += x.min; });
      return { m, per, total: Object.values(per).reduce((s, v) => s + v, 0) };
    });
    const max = Math.max(60, ...data.map((d) => d.total));
    const chart = document.createElement("div"); chart.className = "bz-chart"; chart.setAttribute("role", "img");
    chart.setAttribute("aria-label", "Trainingszeit pro Woche: " + data.map((d) => d.m.toLocaleDateString("de-DE", { day: "numeric", month: "numeric" }) + " " + fmtDur(d.total)).join(", "));
    const tip = document.createElement("div"); tip.className = "bz-tip"; tip.hidden = true;
    data.forEach((d, i) => {
      const col = document.createElement("div"); col.className = "bz-col" + (i === data.length - 1 ? " now" : "");
      const stack = document.createElement("div"); stack.className = "bz-stack";
      stack.style.height = (d.total / max * 100) + "%";
      CATS.forEach((c) => {
        if (!d.per[c.id]) return;
        const seg = document.createElement("span"); seg.className = "bz-seg";
        seg.style.flexGrow = d.per[c.id]; seg.style.background = c.color;
        stack.append(seg);
      });
      const val = document.createElement("span"); val.className = "bz-val";
      val.textContent = d.total ? (d.total >= 60 ? (Math.round(d.total / 6) / 10).toString().replace(".", ",") + " h" : Math.round(d.total) + "′") : "";
      const lab = document.createElement("span"); lab.className = "bz-x";
      lab.textContent = i === data.length - 1 ? "jetzt" : d.m.toLocaleDateString("de-DE", { day: "numeric", month: "numeric" });
      const bar = document.createElement("div"); bar.className = "bz-bar"; bar.append(val, stack);
      col.append(bar, lab);
      const show = () => {
        tip.innerHTML = "";
        const t = document.createElement("b"); t.textContent = "Woche ab " + d.m.toLocaleDateString("de-DE", { day: "numeric", month: "short" }) + ": " + fmtDur(d.total);
        tip.append(t);
        CATS.forEach((c) => { if (!d.per[c.id]) return; const r = document.createElement("div"); const dot = document.createElement("span"); dot.className = "sdot"; dot.style.background = c.color; r.append(dot, document.createTextNode(c.label + " " + fmtDur(d.per[c.id]))); tip.append(r); });
        tip.hidden = false;
        chart.querySelectorAll(".bz-col").forEach((x) => x.classList.toggle("sel", x === col));
      };
      col.tabIndex = 0;
      col.addEventListener("mouseenter", show); col.addEventListener("focus", show); col.addEventListener("click", show);
      chart.append(col);
    });
    chart.addEventListener("mouseleave", () => { tip.hidden = true; chart.querySelectorAll(".bz-col").forEach((x) => x.classList.remove("sel")); });
    const legend = document.createElement("div"); legend.className = "bz-legend";
    CATS.forEach((c) => { const s = document.createElement("span"); const dot = document.createElement("span"); dot.className = "sdot"; dot.style.background = c.color; s.append(dot, document.createTextNode(c.label)); legend.append(s); });
    body.append(legend, chart, tip);
  }

  function bests(body) {
    const best = (sport) => entries.filter((e) => e.sport === sport && e.km).sort((a, b) => b.km - a.km)[0];
    const rows = [
      ["Längster Lauf", best("run"), (e) => fmtNum(e.km, 1) + " km"],
      ["Längste Radfahrt", best("bike"), (e) => fmtNum(e.km, 1) + " km"],
      ["Längstes Schwimmen", best("swim"), (e) => fmtNum(Math.round(e.km * 1000), 0) + " m"]
    ].filter((r) => r[1]);
    if (!rows.length) return;
    const h = document.createElement("div"); h.className = "season-h"; h.textContent = "Deine Bestwerte";
    const ul = document.createElement("ul"); ul.className = "bz-bests";
    rows.forEach(([l, e, f]) => {
      const li = document.createElement("li");
      const a = document.createElement("span"); a.textContent = l;
      const b = document.createElement("b"); b.textContent = f(e);
      const d = document.createElement("span"); d.className = "hint"; d.textContent = parse(e.date).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
      li.append(a, b, d); ul.append(li);
    });
    body.append(h, ul);
  }

  function bind() {
    document.querySelectorAll("#bilanz-range .chip").forEach((c) => c.addEventListener("click", () => {
      range = c.dataset.v;
      try { localStorage.setItem("tri-bilanz-range", range); } catch (e) { /* egal */ }
      draw();
    }));
  }

  return { bind, render };
})();
