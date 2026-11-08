// Saisonplan: feste Trainingswoche (training_setup) und Plan bis zum Wettkampf (season_plans).

const DAYS7 = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MIN_OPTS = [
  { v: 0, t: "–" }, { v: 30, t: "30" }, { v: 45, t: "45" },
  { v: 60, t: "60" }, { v: 90, t: "90" }, { v: 120, t: "2 h+" }
];
const RECOMMEND = {
  olympisch: { days: 5, minDays: 4, minMinutes: 240, text: "Empfehlung für die Olympische Distanz: 5 Trainingstage (mindestens 4). Im Winter reichen 4–5 Stunden pro Woche, im Frühjahr steigt es auf 6–7 Stunden. Ein Tag am Wochenende sollte 2 Stunden möglich machen." },
  sprint: { days: 4, minDays: 3, minMinutes: 180, text: "Empfehlung für die Sprintdistanz: 4 Trainingstage (mindestens 3). Etwa 3–4 Stunden pro Woche, in der Spitze 4–5 Stunden. Ein Tag am Wochenende sollte 90 Minuten möglich machen." }
};

function fmtMinutes(m) {
  const h = Math.floor(m / 60), r = m % 60;
  return h ? h + ":" + String(r).padStart(2, "0") + " h" : r + " Min.";
}

// ---------- Trainingswoche ----------
const Setup = (() => {
  let days = {};
  let saved = null;      // gespeicherte Zeile oder null

  const rec = () => RECOMMEND[(me && me.distance) || "olympisch"] || RECOMMEND.olympisch;

  async function load() {
    const { data } = await db.from("training_setup").select("days, notes, updated_at").eq("user_id", me.id).maybeSingle();
    saved = data || null;
    if (saved) { days = { ...saved.days }; return; }
    days = {};
    // Vorschlag aus dem Fragebogen
    const { data: st } = await db.from("athlete_status").select("answers").eq("user_id", me.id).maybeSingle();
    const a = st && st.answers;
    if (a && Array.isArray(a.days) && a.days.length && a.hours_week) {
      const per = a.hours_week * 60 / a.days.length;
      const pick = MIN_OPTS.reduce((b, o) => Math.abs(o.v - per) < Math.abs(b.v - per) ? o : b, MIN_OPTS[0]);
      a.days.forEach((d) => { if (DAYS7.includes(d)) days[d] = pick.v; });
    }
  }

  const exists = () => !!saved;

  async function render() {
    if (!me) return;
    await load();
    $("setup-rec").textContent = rec().text;
    $("setup-badge").hidden = !saved;
    const box = $("setup-days"); box.innerHTML = "";
    DAYS7.forEach((d) => {
      const row = document.createElement("div"); row.className = "wday";
      const lab = document.createElement("span"); lab.className = "wday-name"; lab.textContent = d; lab.id = "sd-" + d;
      const chips = document.createElement("div"); chips.className = "wchips";
      chips.setAttribute("role", "radiogroup"); chips.setAttribute("aria-labelledby", "sd-" + d);
      MIN_OPTS.forEach((o) => {
        const b = document.createElement("button"); b.type = "button"; b.className = "wchip"; b.textContent = o.t;
        b.setAttribute("aria-label", d + ": " + (o.v ? (o.v >= 120 ? "2 Stunden oder mehr" : o.v + " Minuten") : "kein Training"));
        b.setAttribute("aria-pressed", (Number(days[d]) || 0) === o.v);
        b.addEventListener("click", () => {
          days[d] = o.v;
          chips.querySelectorAll(".wchip").forEach((c, i) => c.setAttribute("aria-pressed", MIN_OPTS[i].v === o.v));
          updateTotal();
        });
        chips.append(b);
      });
      row.append(lab, chips); box.append(row);
    });
    $("setup-notes").value = saved && saved.notes ? saved.notes : "";
    $("setup-msg").textContent = "";
    $("setup-save").textContent = saved ? "Änderungen speichern" : "Trainingswoche speichern";
    updateTotal();
  }

  function updateTotal() {
    const n = DAYS7.filter((d) => Number(days[d]) > 0).length;
    const t = DAYS7.reduce((s, d) => s + (Number(days[d]) || 0), 0);
    $("setup-total").textContent = t ? fmtMinutes(t) + " an " + n + (n === 1 ? " Tag" : " Tagen") : "Noch keine Tage gewählt";
    const r = rec(); const warn = $("setup-warn");
    if (t && (n < r.minDays || t < r.minMinutes)) {
      warn.hidden = false;
      warn.textContent = "Das ist knapp für deine Distanz. Machbar, aber Claude empfiehlt mindestens " + r.minDays + " Tage und " + fmtMinutes(r.minMinutes) + " pro Woche.";
    } else warn.hidden = true;
  }

  async function save() {
    const msg = $("setup-msg");
    const n = DAYS7.filter((d) => Number(days[d]) > 0).length;
    if (!n) { msg.textContent = "Bitte wähle mindestens einen Trainingstag."; msg.className = "msg error"; return; }
    const clean = {}; DAYS7.forEach((d) => { clean[d] = Number(days[d]) || 0; });
    const row = { user_id: me.id, days: clean, notes: $("setup-notes").value.trim() || null };
    const btn = $("setup-save"); btn.disabled = true;
    const { error } = await db.from("training_setup").upsert(row, { onConflict: "user_id" });
    btn.disabled = false;
    if (error) { msg.textContent = translate(error); msg.className = "msg error"; return; }
    saved = row;
    $("setup-badge").hidden = false;
    btn.textContent = "Änderungen speichern";
    msg.textContent = "Gespeichert ✓ Claude erstellt bzw. aktualisiert deinen Saisonplan spätestens zur nächsten vollen Stunde (8–22 Uhr).";
    msg.className = "msg ok";
    Saison.render(); renderHints(); Woche.render();
  }

  function bind() { $("setup-save").addEventListener("click", save); }

  return { bind, render, exists, daysNow: () => saved ? saved.days : null };
})();

// ---------- Saisonplan ----------
const Saison = (() => {
  const PHASE_COLORS = ["var(--swim)", "var(--run)", "var(--bike)", "#8b6fd6", "var(--muted)"];
  let data = null;

  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const thisMonday = () => { const n = new Date(); const d = new Date(n.getFullYear(), n.getMonth(), n.getDate()); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
  const fmtDate = (s, o) => parse(s).toLocaleDateString("de-DE", o || { day: "numeric", month: "short" });

  async function render() {
    if (!me) return;
    const res = await db.from("season_plans").select("summary, phases, weeks, milestones, milestones_done, written_at").eq("user_id", me.id).maybeSingle();
    data = res.data || null;
    const body = $("season-body"); body.innerHTML = "";
    if (!data) {
      const p = document.createElement("p"); p.className = "hint"; p.style.margin = "0";
      p.textContent = Setup.exists()
        ? "Dein Saisonplan wird gerade erstellt. Du bekommst eine Benachrichtigung, sobald er da ist (spätestens zur nächsten vollen Stunde, 8–22 Uhr)."
        : "Leg unten zuerst deine Trainingswoche fest. Daraus erstellt Claude deinen Plan bis zum Wettkampf.";
      body.append(p);
      return;
    }
    if (data.summary) { const s = document.createElement("p"); s.className = "season-summary"; s.textContent = data.summary; body.append(s); }
    body.append(phaseBar(), milestoneList(), weekList());
  }

  function phaseBar() {
    const wrap = document.createElement("div");
    const weeks = Array.isArray(data.weeks) ? data.weeks : [];
    const phases = Array.isArray(data.phases) ? data.phases : [];
    const cur = thisMonday();
    const bar = document.createElement("div"); bar.className = "phase-bar";
    phases.forEach((ph, i) => {
      const n = weeks.filter((w) => w.phase === ph.name).length || 1;
      const seg = document.createElement("div"); seg.className = "phase-seg";
      seg.style.flex = String(n); seg.style.background = PHASE_COLORS[i % PHASE_COLORS.length];
      seg.title = ph.name;
      bar.append(seg);
    });
    // Markierung „heute“
    const idx = weeks.findIndex((w) => w.week_start >= cur);
    if (weeks.length && idx >= 0) {
      const mark = document.createElement("div"); mark.className = "phase-now";
      mark.style.left = ((idx + 0.5) / weeks.length * 100) + "%";
      bar.append(mark);
    }
    wrap.append(bar);
    const legend = document.createElement("div"); legend.className = "phase-legend";
    phases.forEach((ph, i) => {
      const it = document.createElement("div"); it.className = "phase-item";
      const nowPh = ph.from <= cur && cur <= ph.to;
      if (nowPh) it.classList.add("now");
      const dot = document.createElement("span"); dot.className = "sdot"; dot.style.background = PHASE_COLORS[i % PHASE_COLORS.length];
      const t = document.createElement("div");
      const b = document.createElement("b"); b.textContent = ph.name + (nowPh ? " · jetzt" : "");
      const m = document.createElement("span"); m.className = "hint";
      m.textContent = fmtDate(ph.from) + " – " + fmtDate(ph.to) + (ph.goal ? " · " + ph.goal : "");
      t.append(b, m); it.append(dot, t); legend.append(it);
    });
    wrap.append(legend);
    return wrap;
  }

  function milestoneList() {
    const wrap = document.createElement("div");
    const h = document.createElement("h3"); h.className = "season-h"; h.textContent = "Meilensteine";
    wrap.append(h);
    const doneList = Array.isArray(data.milestones_done) ? data.milestones_done : [];
    const doneIds = new Set(doneList.map((x) => x.id));
    const today = iso(new Date());
    (Array.isArray(data.milestones) ? data.milestones : []).forEach((ms) => {
      const row = document.createElement("div"); row.className = "milestone" + (doneIds.has(ms.id) ? " done" : "");
      const check = document.createElement("button"); check.type = "button"; check.className = "check";
      check.setAttribute("aria-pressed", doneIds.has(ms.id));
      check.setAttribute("aria-label", (doneIds.has(ms.id) ? "Geschafft: " : "Als geschafft markieren: ") + ms.title);
      check.addEventListener("click", async () => {
        const was = doneIds.has(ms.id);
        const next = was ? doneList.filter((x) => x.id !== ms.id) : doneList.concat({ id: ms.id, date: today });
        check.disabled = true;
        const { error } = await db.from("season_plans").update({ milestones_done: next }).eq("user_id", me.id);
        check.disabled = false;
        if (error) return alert(translate(error));
        data.milestones_done = next; render();
      });
      const t = document.createElement("div"); t.className = "ms-text";
      const b = document.createElement("b"); b.textContent = ms.title;
      const m = document.createElement("span"); m.className = "hint";
      const doneEntry = doneList.find((x) => x.id === ms.id);
      m.textContent = doneEntry ? "Geschafft am " + fmtDate(doneEntry.date) + " 🎉" : "bis " + fmtDate(ms.due, { day: "numeric", month: "long" }) + (ms.due < today ? " · überfällig" : "");
      t.append(b, m);
      row.append(check, t); wrap.append(row);
    });
    return wrap;
  }

  function weekList() {
    const det = document.createElement("details"); det.className = "season-weeks";
    const sum = document.createElement("summary");
    const weeks = Array.isArray(data.weeks) ? data.weeks : [];
    sum.textContent = "Alle " + weeks.length + " Wochen anzeigen";
    det.append(sum);
    const cur = thisMonday();
    weeks.forEach((w, i) => {
      const r = document.createElement("div"); r.className = "sw-row" + (w.week_start === cur ? " now" : "") + (w.week_start < cur ? " past" : "");
      const a = document.createElement("span"); a.className = "sw-date"; a.textContent = "W" + (i + 1) + " · " + fmtDate(w.week_start, { day: "numeric", month: "numeric" });
      const b = document.createElement("span"); b.className = "sw-focus";
      b.textContent = (w.focus || w.phase || "") + (w.test ? " · Test: " + w.test : "");
      const c = document.createElement("span"); c.className = "sw-min";
      c.textContent = w.minutes ? fmtMinutes(w.minutes) : "";
      if (w.recovery) { const l = document.createElement("span"); l.className = "sw-easy"; l.textContent = "leicht"; c.append(l); }
      r.append(a, b, c); det.append(r);
    });
    return det;
  }

  return { render };
})();
