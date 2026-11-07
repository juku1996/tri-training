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

  return { render };
})();
