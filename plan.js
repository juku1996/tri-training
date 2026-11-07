// Wochenplan anzeigen und Einheiten abhaken.
// Pläne schreibt Claude in training_plans; die App ändert nur die Spalte "done".

const Plan = (() => {
  const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const SPORT = {
    swim: { label: "Schwimmen", color: "var(--swim)" },
    bike: { label: "Rad", color: "var(--bike)" },
    run: { label: "Laufen", color: "var(--run)" },
    strength: { label: "Kraft", color: "#8b6fd6" },
    other: { label: "Sonstiges", color: "var(--muted)" }
  };

  let plans = [];
  let idx = 0;

  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  function thisMonday() {
    const n = new Date();
    const d = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  function dayDate(weekStart, day) {
    const d = parse(weekStart);
    d.setDate(d.getDate() + DAYS.indexOf(day));
    return d;
  }
  function rangeText(ws) {
    const s = parse(ws), e = parse(ws); e.setDate(e.getDate() + 6);
    const o = { day: "numeric", month: "short" };
    return s.toLocaleDateString("de-DE", o) + " – " + e.toLocaleDateString("de-DE", o);
  }
  const isToday = (d) => iso(d) === iso(new Date());

  async function render() {
    const card = $("plan-card");
    if (!card || !me) return;
    const { data, error } = await db.from("training_plans")
      .select("week_start, note, sessions, done")
      .eq("user_id", me.id)
      .gte("week_start", iso(thisMonday()))
      .order("week_start")
      .limit(2);
    if (error) { $("plan-body").textContent = translate(error); return; }
    plans = data || [];
    if (idx >= plans.length) idx = 0;
    draw();
  }

  function draw() {
    const body = $("plan-body");
    const tabs = $("plan-tabs");
    body.innerHTML = ""; tabs.innerHTML = "";
    $("plan-range").textContent = "";
    $("plan-progress").hidden = true;

    if (!plans.length) {
      const p = document.createElement("p");
      p.className = "hint"; p.style.margin = "0";
      p.textContent = "Noch kein Plan. Trag unten deine Woche ein, dann erstellt Claude deinen Plan.";
      body.append(p);
      return;
    }

    if (plans.length > 1) {
      const cur = iso(thisMonday());
      plans.forEach((p, i) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "chip";
        b.textContent = p.week_start === cur ? "Diese Woche" : "Nächste Woche";
        b.setAttribute("aria-pressed", i === idx);
        b.addEventListener("click", () => { idx = i; draw(); });
        tabs.append(b);
      });
    }

    const plan = plans[idx];
    $("plan-range").textContent = rangeText(plan.week_start);
    if (plan.note) {
      const n = document.createElement("p");
      n.className = "plan-note"; n.textContent = plan.note;
      body.append(n);
    }

    const sessions = Array.isArray(plan.sessions) ? plan.sessions : [];
    const done = new Set(Array.isArray(plan.done) ? plan.done : []);
    const required = sessions.filter((s) => !s.optional);
    const updateProgress = () => {
      const n = required.filter((s) => done.has(s.id)).length;
      $("plan-progress").hidden = !required.length;
      $("plan-progress-text").textContent = n + " von " + required.length + " Einheiten erledigt";
      $("plan-progress-bar").style.width = (required.length ? Math.round(n / required.length * 100) : 0) + "%";
    };

    DAYS.forEach((day) => {
      const list = sessions.filter((s) => s.day === day);
      if (!list.length) return;
      const date = dayDate(plan.week_start, day);
      const h = document.createElement("div");
      h.className = "plan-day" + (isToday(date) ? " today" : "");
      h.textContent = date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "short" }) + (isToday(date) ? " · heute" : "");
      body.append(h);

      list.forEach((s) => {
        const sp = SPORT[s.sport] || SPORT.other;
        const item = document.createElement("div");
        item.className = "session" + (done.has(s.id) ? " done" : "");

        const check = document.createElement("button");
        check.type = "button"; check.className = "check";
        check.setAttribute("aria-pressed", done.has(s.id));
        check.setAttribute("aria-label", (done.has(s.id) ? "Erledigt: " : "Als erledigt markieren: ") + s.title);
        check.addEventListener("click", async () => {
          const was = done.has(s.id);
          was ? done.delete(s.id) : done.add(s.id);
          item.classList.toggle("done", !was);
          check.setAttribute("aria-pressed", !was);
          updateProgress();
          const { error } = await db.from("training_plans").update({ done: [...done] })
            .eq("user_id", me.id).eq("week_start", plan.week_start);
          if (error) {
            was ? done.add(s.id) : done.delete(s.id);
            item.classList.toggle("done", was);
            check.setAttribute("aria-pressed", was);
            updateProgress();
            alert(translate(error));
          } else {
            plan.done = [...done];
            renderToday();
          }
        });

        const main = document.createElement("details");
        main.className = "session-main";
        const sum = document.createElement("summary");
        const title = document.createElement("div");
        title.className = "session-title";
        const dot = document.createElement("span");
        dot.className = "sdot"; dot.style.background = sp.color;
        title.append(dot, document.createTextNode(s.title));
        if (s.optional) {
          const o = document.createElement("span");
          o.className = "pill opt-pill"; o.textContent = "optional";
          title.append(o);
        }
        const meta = document.createElement("div");
        meta.className = "session-meta";
        meta.textContent = [sp.label, s.duration_min ? s.duration_min + " Min." : null, s.intensity].filter(Boolean).join(" · ");
        sum.append(title, meta);
        if ((Array.isArray(s.details) && s.details.length) || s.tip) sum.className = "has-details";
        main.append(sum);
        if (Array.isArray(s.details) && s.details.length) {
          const ul = document.createElement("ul");
          s.details.forEach((t) => { const li = document.createElement("li"); li.textContent = t; ul.append(li); });
          main.append(ul);
        }
        if (s.tip) {
          const tip = document.createElement("p");
          tip.className = "session-tip"; tip.textContent = s.tip;
          main.append(tip);
        }
        item.append(check, main);
        body.append(item);
      });
    });
    updateProgress();
  }

  // ---------- „Als Nächstes“ im Bereich Heute ----------
  async function saveDone(plan, doneSet) {
    const { error } = await db.from("training_plans").update({ done: [...doneSet] })
      .eq("user_id", me.id).eq("week_start", plan.week_start);
    if (!error) plan.done = [...doneSet];
    return error;
  }

  function nextSession() {
    const today = parse(iso(new Date()));
    const all = [];
    plans.forEach((p) => {
      const done = new Set(Array.isArray(p.done) ? p.done : []);
      (Array.isArray(p.sessions) ? p.sessions : []).forEach((s, i) => {
        const d = dayDate(p.week_start, s.day);
        if (d >= today && !done.has(s.id)) all.push({ plan: p, s, d, i });
      });
    });
    all.sort((a, b) => (a.d - b.d) || (a.i - b.i));
    return all.find((x) => !x.s.optional) || all[0] || null;
  }

  function weekProgress() {
    const cur = plans.find((p) => p.week_start === iso(thisMonday()));
    if (!cur) return null;
    const req = (cur.sessions || []).filter((s) => !s.optional);
    const done = new Set(cur.done || []);
    return { n: req.filter((s) => done.has(s.id)).length, total: req.length };
  }

  function renderToday() {
    const body = $("today-body");
    if (!body) return;
    body.innerHTML = "";
    const title = $("today-title");
    const actions = document.createElement("div"); actions.className = "today-actions";

    if (!plans.length) {
      title.textContent = "Dein Plan";
      const p = document.createElement("p"); p.className = "hint"; p.style.margin = "0";
      p.textContent = "Noch kein Plan. Trag deine Woche ein, dann erstellt Claude ihn für dich.";
      const b = document.createElement("button"); b.type = "button"; b.textContent = "Woche eintragen";
      b.addEventListener("click", () => { Woche.focusNext(); Woche.render(); showTab("plan", "week-card"); });
      actions.append(b);
      body.append(p, actions);
      return;
    }

    const nx = nextSession();
    const prog = weekProgress();
    if (!nx) {
      title.textContent = "Geschafft";
      const p = document.createElement("p"); p.style.margin = "0";
      p.textContent = "Alle Einheiten erledigt. Stark! 🎉";
      body.append(p);
    } else {
      const sp = SPORT[nx.s.sport] || SPORT.other;
      const isTod = isToday(nx.d);
      title.textContent = isTod ? "Heute" : "Als Nächstes";
      const when = document.createElement("div"); when.className = "today-when";
      when.textContent = nx.d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "short" });
      const item = document.createElement("div"); item.className = "today-item";
      const dot = document.createElement("span"); dot.className = "sdot"; dot.style.background = sp.color;
      const txt = document.createElement("div");
      const t = document.createElement("div"); t.className = "t"; t.textContent = nx.s.title;
      const m = document.createElement("div"); m.className = "m";
      m.textContent = [sp.label, nx.s.duration_min ? nx.s.duration_min + " Min." : null, nx.s.intensity].filter(Boolean).join(" · ");
      txt.append(t, m);
      if (Array.isArray(nx.s.details) && nx.s.details.length) {
        const ul = document.createElement("ul"); ul.style.margin = "8px 0 0"; ul.style.paddingLeft = "18px";
        nx.s.details.forEach((d) => { const li = document.createElement("li"); li.textContent = d; li.style.margin = "3px 0"; ul.append(li); });
        txt.append(ul);
      }
      item.append(dot, txt);
      body.append(when, item);

      const doneBtn = document.createElement("button"); doneBtn.type = "button"; doneBtn.textContent = "Erledigt ✓";
      doneBtn.addEventListener("click", async () => {
        doneBtn.disabled = true;
        const set = new Set(nx.plan.done || []); set.add(nx.s.id);
        const err = await saveDone(nx.plan, set);
        doneBtn.disabled = false;
        if (err) return alert(translate(err));
        draw(); renderToday();
      });
      actions.append(doneBtn);
    }
    const all = document.createElement("button"); all.type = "button"; all.className = "secondary"; all.textContent = "Ganzer Plan";
    all.dataset.goto = "plan"; all.dataset.scroll = "plan-card";
    actions.append(all);
    body.append(actions);
    if (prog && prog.total) {
      const p = document.createElement("p"); p.className = "hint"; p.style.margin = "12px 0 0";
      p.textContent = "Diese Woche: " + prog.n + " von " + prog.total + " Einheiten erledigt";
      body.append(p);
    }
  }

  return { render, renderToday };
})();
