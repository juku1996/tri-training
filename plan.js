// Wochenplan anzeigen und Einheiten abhaken.
// Pläne schreibt Claude in training_plans; die App ändert nur die Spalte "done".
// Ersetzte Einheiten stehen in "replaced" (setzt ein DB-Trigger), Verschieben läuft über die Funktion move_session.

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
  let replanWeeks = new Set();   // Wochen, die nach dem Plan geändert wurden
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
      .select("week_start, note, sessions, done, replaced, skipped, plan_written_at")
      .eq("user_id", me.id)
      .gte("week_start", iso(thisMonday()))
      .order("week_start")
      .limit(5);
    if (error) { $("plan-body").textContent = translate(error); return; }
    plans = data || [];
    if (idx >= plans.length) idx = 0;
    await Promise.all([pendingWeeks(), Ergebnis.loadFor(plans.map((p) => p.week_start)), loadSubs(),
      typeof Partner !== "undefined" ? Partner.loadPlans(plans.map((p) => p.week_start)) : null]);
    draw();
  }

  // Ersatztrainings (freie Trainings, die eine geplante Einheit ersetzen): key week_start|session_id → workout
  // Absagen (eigene, mit Grund): key week_start|session_id → { reason, note }
  // freeWeek: freie Trainings dieser Woche ohne Bezug zum Plan
  let subs = {}, skips = {}, freeWeek = 0;
  async function loadSubs() {
    subs = {}; skips = {}; freeWeek = 0;
    if (!me) return;
    const [w, k, f] = await Promise.all([
      db.from("workouts")
        .select("id, day, sport, title, status, duration_min, distance_km, elevation_m, calories, avg_hr, feeling, note, exercises, replaces, needs_details")
        .eq("user_id", me.id).not("replaces", "is", null),
      db.from("session_skips").select("week_start, session_id, reason, note").eq("user_id", me.id),
      db.from("workouts").select("id, day, replaces").eq("user_id", me.id).eq("status", "erledigt").gte("day", iso(thisMonday()))
    ]);
    (w.data || []).forEach((x) => { if (x.replaces) subs[x.replaces.week_start + "|" + x.replaces.session_id] = x; });
    (k.data || []).forEach((x) => { skips[x.week_start + "|" + x.session_id] = x; });
    const end = thisMonday(); end.setDate(end.getDate() + 6);
    freeWeek = (f.data || []).filter((x) => !x.replaces && x.day <= iso(end)).length;
  }

  // Zahlen einer Woche: geplante Einheiten (Pflicht + erledigte optionale), erledigt, ersetzt, abgesagt
  function stats(plan) {
    const ss = Array.isArray(plan.sessions) ? plan.sessions : [];
    const done = new Set(plan.done || []), repl = new Set(plan.replaced || []), skip = new Set(plan.skipped || []);
    const counted = ss.filter((x) => !skip.has(x.id) && (!x.optional || done.has(x.id) || repl.has(x.id)));
    return {
      n: counted.filter((x) => done.has(x.id) || repl.has(x.id)).length,
      total: counted.length,
      r: ss.filter((x) => repl.has(x.id)).length,
      k: ss.filter((x) => skip.has(x.id)).length,
      made: ss.filter((x) => done.has(x.id) || repl.has(x.id)).length
    };
  }
  const extras = (st) => [st.r ? st.r + " durch anderes Training" : null, st.k ? st.k + " abgesagt" : null].filter(Boolean).join(", ");
  const REASONS = { zeit: "Keine Zeit", krank: "Krank", schmerzen: "Schmerzen", muede: "Zu müde", wetter: "Wetter", motivation: "Keine Lust", sonstiges: "Anderer Grund" };

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
        const d = parse(p.week_start), nextMon = new Date(parse(cur)); nextMon.setDate(nextMon.getDate() + 7);
        const date = d.getDate() + "." + (d.getMonth() + 1) + ".";
        const many = plans.length > 3;
        b.textContent = p.week_start === cur ? (many ? "Jetzt" : "Diese Woche") : (many ? date : (p.week_start === iso(nextMon) ? "Nächste" : "ab " + date));
        b.setAttribute("aria-label", "Woche ab " + date);
        b.setAttribute("aria-pressed", i === idx);
        b.addEventListener("click", () => { idx = i; draw(); });
        tabs.append(b);
      });
    }

    const plan = plans[idx];
    $("plan-range").textContent = rangeText(plan.week_start);
    if (replanWeeks.has(plan.week_start)) {
      const r = document.createElement("div"); r.className = "replan-banner";
      r.textContent = "Du hast diese Woche geändert. Dein neuer Trainingsplan wird erstellt, bis dahin gilt dieser hier.";
      body.append(r);
    }
    if (plan.note) {
      const n = document.createElement("p");
      n.className = "plan-note"; n.textContent = plan.note;
      body.append(n);
    }

    const sessions = Array.isArray(plan.sessions) ? plan.sessions : [];
    const done = new Set(Array.isArray(plan.done) ? plan.done : []);
    const repl = new Set(Array.isArray(plan.replaced) ? plan.replaced : []);
    const skip = new Set(Array.isArray(plan.skipped) ? plan.skipped : []);
    const updateProgress = () => {
      const st = stats(Object.assign({}, plan, { done: [...done] }));
      const ex = extras(st);
      $("plan-progress").hidden = !st.total && !st.k;
      $("plan-progress-text").textContent = st.n + " von " + st.total + " Einheiten erledigt" + (ex ? " (" + ex + ")" : "");
      $("plan-progress-bar").style.width = (st.total ? Math.round(st.n / st.total * 100) : 0) + "%";
    };

    const partner = typeof Partner !== "undefined" ? Partner.get() : null;
    const pplan = partner ? Partner.planFor(plan.week_start) : null;
    DAYS.forEach((day) => {
      const list = sessions.filter((s) => s.day === day);
      const plist = pplan && Array.isArray(pplan.sessions) ? pplan.sessions.filter((s) => s.day === day) : [];
      if (!list.length && !plist.length) return;
      const date = dayDate(plan.week_start, day);
      const h = document.createElement("div");
      h.className = "plan-day" + (isToday(date) ? " today" : "");
      const ht = document.createElement("span");
      ht.textContent = date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "short" }) + (isToday(date) ? " · heute" : "");
      h.append(ht);
      const wl = typeof Wetter !== "undefined" ? Wetter.label(iso(date)) : "";
      if (wl) { const w = document.createElement("span"); w.className = "day-weather"; w.textContent = wl; h.append(w); }
      body.append(h);

      list.forEach((s) => {
        const sp = SPORT[s.sport] || SPORT.other;
        const item = document.createElement("div");
        const sub = subs[plan.week_start + "|" + s.id] || null;
        const isRepl = !!sub || repl.has(s.id);
        const isSkip = !isRepl && !done.has(s.id) && skip.has(s.id);
        const sk = skips[plan.week_start + "|" + s.id] || null;
        item.className = "session" + (done.has(s.id) ? " done" : "") + (isRepl ? " replaced" : "") + (isSkip ? " skipped" : "");

        const check = document.createElement("button");
        check.type = "button"; check.className = "check" + (isRepl ? " subst" : "") + (isSkip ? " skip" : "");
        check.setAttribute("aria-pressed", done.has(s.id));
        check.setAttribute("aria-label", isRepl ? "Ersetzt durch anderes Training: " + s.title : isSkip ? "Abgesagt, doch gemacht? " + s.title : (done.has(s.id) ? "Erledigt: " : "Als erledigt markieren: ") + s.title);
        if (isRepl) check.textContent = "🔁";
        if (isSkip) check.textContent = "✕";
        check.addEventListener("click", async () => {
          if (sub) { Training.open(sub); return; }   // Ersatztraining: über das Training bearbeiten/löschen
          if (isRepl) return;
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
            if (isSkip) { await render(); renderToday(); if (!was) Ergebnis.open(plan, s, () => draw()); return; }
            renderToday();
            if (typeof Bilanz !== "undefined") Bilanz.render();
            if (!was) Ergebnis.open(plan, s, () => draw());
          }
        });

        const main = document.createElement("details");
        main.className = "session-main";
        const sum = document.createElement("summary");
        const title = document.createElement("div");
        title.className = "session-title";
        const dot = document.createElement("span");
        dot.className = "sdot"; dot.style.background = sp.color;
        const tt = document.createElement("span"); tt.className = "st-text"; tt.textContent = s.title;
        title.append(dot, tt);
        if (isRepl || isSkip) {
          const o = document.createElement("span");
          o.className = "pill repl-pill"; o.textContent = isSkip ? "abgesagt" : "nicht gemacht";
          title.append(o);
        } else if (s.optional) {
          const o = document.createElement("span");
          o.className = "pill opt-pill"; o.textContent = "optional";
          title.append(o);
        }
        if (s.together) title.append(togetherPill(partner));
        const meta = document.createElement("div");
        meta.className = "session-meta";
        // Ersetzte Einheit: beim Aufklappen nur das Ersatztraining zeigen, nicht den ursprünglichen Plan
        const exPlan = !sub && hasGym(s) ? exTable(s) : null;
        const exN = exPlan ? exPlan.querySelectorAll("li").length : 0;
        meta.textContent = [sp.label, s.duration_min ? s.duration_min + " Min." : null, exN ? exN + " Übungen" : null, s.intensity].filter(Boolean).join(" · ");
        sum.append(title, meta);
        if (s.moved_from) sum.append(movedLine(s.moved_from));
        if (s.weather_note) {
          const wn = document.createElement("div");
          wn.className = "session-weather"; wn.textContent = "☔ " + s.weather_note;
          sum.append(wn);
        }
        const res = Ergebnis.get(plan.week_start, s.id);
        if (res && Ergebnis.summary(s, res)) {
          const rl = document.createElement("div");
          rl.className = "session-res"; rl.textContent = Ergebnis.summary(s, res);
          sum.append(rl);
        }
        if (!sub && ((Array.isArray(s.details) && s.details.length) || s.tip || done.has(s.id) || exPlan)) sum.className = "has-details";
        main.append(sum);
        if (exPlan) main.append(exPlan);
        if (!sub && Array.isArray(s.details) && s.details.length) {
          if (exPlan) { const hh = document.createElement("div"); hh.className = "ex-plan-h"; hh.textContent = "Hinweise"; main.append(hh); }
          const ul = document.createElement("ul");
          s.details.forEach((t) => { const li = document.createElement("li"); li.textContent = t; ul.append(li); });
          main.append(ul);
        }
        if (!sub && s.tip) {
          const tip = document.createElement("p");
          tip.className = "session-tip"; tip.textContent = s.tip;
          main.append(tip);
        }
        if (res && Array.isArray(res.values && res.values.exercises) && res.values.exercises.length) {
          const hh = document.createElement("div"); hh.className = "ex-plan-h"; hh.textContent = "Gemacht";
          main.append(hh);
          const ul = document.createElement("ul"); ul.className = "ex-list";
          res.values.exercises.forEach((e) => { const li = document.createElement("li"); li.textContent = Uebungen.line(e); ul.append(li); });
          main.append(ul);
        }
        const sDate = dayDate(plan.week_start, s.day);
        if (sub) {
          const tsp = Training.sportOf(sub.sport);
          const line = document.createElement("div"); line.className = "subst-line";
          const ic = document.createElement("span"); ic.className = "subst-ic"; ic.textContent = tsp.icon;
          const lt = document.createElement("span");
          const lb = document.createElement("b"); lb.textContent = "Stattdessen gemacht: " + (sub.title || tsp.label);
          const lm = document.createElement("span"); lm.className = "subst-meta";
          lm.textContent = [tsp.label !== sub.title ? tsp.label : null, sub.duration_min ? sub.duration_min + " Min." : null, sub.needs_details ? "Werte fehlen noch" : "✓ erledigt"].filter(Boolean).join(" · ");
          lt.append(lb, lm); line.append(ic, lt);
          sum.append(line);
          main.append(subInfo(sub));
          const eb = document.createElement("button"); eb.type = "button"; eb.className = "ghost res-edit";
          eb.textContent = sub.needs_details ? "Werte eintragen" : "Ersatztraining bearbeiten";
          eb.addEventListener("click", () => Training.open(sub));
          main.append(eb);
          if (!sum.className) sum.className = "has-details";
        } else if (repl.has(s.id)) {
          const line = document.createElement("div"); line.className = "subst-line";
          line.textContent = "🔁 Durch ein anderes Training ersetzt";
          sum.append(line);
        } else if (isSkip) {
          const line = document.createElement("div"); line.className = "skip-line";
          line.textContent = "Abgesagt" + (sk ? " · " + (REASONS[sk.reason] || "") + (sk.note ? ": " + sk.note : "") : "");
          sum.append(line);
          const ub = document.createElement("button"); ub.type = "button"; ub.className = "ghost res-edit";
          ub.textContent = "Absage zurücknehmen";
          ub.addEventListener("click", async () => {
            ub.disabled = true;
            const { error } = await db.from("session_skips").delete().eq("user_id", me.id).eq("week_start", plan.week_start).eq("session_id", s.id);
            if (error) { ub.disabled = false; return alert(translate(error)); }
            await render(); renderToday();
          });
          main.append(ub);
          if (!sum.className) sum.className = "has-details";
        } else if (!done.has(s.id)) {
          const row = document.createElement("div"); row.className = "sess-actions";
          const mv = document.createElement("button"); mv.type = "button"; mv.className = "ghost";
          mv.textContent = "📅 Verschieben";
          mv.addEventListener("click", () => Move.open(plan, s));
          row.append(mv);
          if (sDate <= parse(iso(new Date()))) {
            const ab = document.createElement("button"); ab.type = "button"; ab.className = "ghost";
            ab.textContent = "🔁 Anderes Training gemacht";
            ab.addEventListener("click", () => Training.open(null, null, { replaces: { week_start: plan.week_start, session_id: s.id, day: iso(sDate), title: s.title } }));
            row.append(ab);
          }
          const cx = document.createElement("button"); cx.type = "button"; cx.className = "ghost";
          cx.textContent = "✕ Absagen";
          cx.addEventListener("click", () => Absage.open(plan, s));
          row.append(cx);
          main.append(row);
          if (!sum.className) sum.className = "has-details";
        }
        if (hasGym(s) && !done.has(s.id) && !isRepl && !isSkip) {
          const lb = document.createElement("button"); lb.type = "button"; lb.className = "secondary res-edit gym-go";
          lb.textContent = "▶ Live mitschreiben";
          lb.addEventListener("click", () => Gym.start({ week_start: plan.week_start, session: s }));
          main.append(lb);
          if (!sum.className) sum.className = "has-details";
        }
        if (done.has(s.id) && !isRepl) {
          const eb = document.createElement("button"); eb.type = "button"; eb.className = "ghost res-edit";
          eb.textContent = res ? "Werte bearbeiten" : "Werte eintragen";
          eb.addEventListener("click", () => Ergebnis.open(plan, s, () => draw()));
          main.append(eb);
        }
        item.append(check, main);
        body.append(item);
      });
      if (plist.length) body.append(partnerLine(partner, plist, new Set(pplan.done || []), new Set(pplan.replaced || []), new Set(pplan.skipped || [])));
    });
    updateProgress();
  }

  // Gym-Teil: Kraft-Einheit oder jede Einheit mit hinterlegten Übungen (z. B. Laufband + Kraft)
  const hasGym = (s) => s.sport === "strength" || (Array.isArray(s.exercises) && s.exercises.length > 0);

  // Klare Übungsliste einer Kraft-Einheit: Name, Sätze × Wdh., letztes Gewicht
  function exTable(s) {
    const list = typeof Uebungen !== "undefined" ? Uebungen.forSession(s) : [];
    if (!list.length) return null;
    const box = document.createElement("div"); box.className = "ex-plan";
    const h = document.createElement("div"); h.className = "ex-plan-h"; h.textContent = "Übungen";
    const ol = document.createElement("ol");
    const lasts = [];
    list.forEach((e) => {
      const li = document.createElement("li");
      const n = document.createElement("span"); n.className = "ex-plan-name"; n.textContent = e.name;
      const sr = document.createElement("span"); sr.className = "ex-plan-sr";
      sr.textContent = e.sets && e.reps ? e.sets + " × " + e.reps : (e.sets ? e.sets + (e.sets === 1 ? " Satz" : " Sätze") : "");
      const last = document.createElement("span"); last.className = "ex-plan-last";
      li.append(n, sr, last); ol.append(li); lasts.push([e, last]);
    });
    box.append(h, ol);
    Uebungen.history().then((hist) => lasts.forEach(([e, el]) => {
      const p = hist.map[Uebungen.keyOf(e.name)];
      el.textContent = p && p.kg != null ? "zuletzt " + String(p.kg).replace(".", ",") + " kg" : (p ? "" : "neu");
    }));
    return box;
  }

  // Werte eines Ersatztrainings (aufgeklappt im Plan)
  function subInfo(w) {
    const box = document.createElement("div"); box.className = "sub-info";
    const fmt = (v, d) => String(Math.round(Number(v) * (d || 1)) / (d || 1)).replace(".", ",");
    const rows = [
      ["Datum", w.day ? parse(w.day).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "numeric" }) : null],
      ["Dauer", w.duration_min ? w.duration_min + " Min." : null],
      ["Distanz", w.distance_km ? fmt(w.distance_km, 100) + " km" : null],
      ["Höhenmeter", w.elevation_m ? fmt(w.elevation_m) + " m" : null],
      ["Ø Puls", w.avg_hr ? fmt(w.avg_hr) + " bpm" : null],
      ["Kalorien", w.calories ? fmt(w.calories) + " kcal" : null],
      ["Gefühl", w.feeling ? w.feeling + " von 5" : null]
    ].filter((r) => r[1]);
    const h = document.createElement("div"); h.className = "ex-plan-h"; h.textContent = "Dein Ersatztraining";
    box.append(h);
    if (rows.length) {
      const dl = document.createElement("dl"); dl.className = "sub-vals";
      rows.forEach(([k, v]) => { const dt = document.createElement("dt"); dt.textContent = k; const dd = document.createElement("dd"); dd.textContent = v; dl.append(dt, dd); });
      box.append(dl);
    }
    if (Array.isArray(w.exercises) && w.exercises.length) {
      const hh = document.createElement("div"); hh.className = "ex-plan-h"; hh.textContent = "Übungen"; box.append(hh);
      const ul = document.createElement("ul"); ul.className = "ex-list";
      w.exercises.forEach((e) => { const li = document.createElement("li"); li.textContent = Uebungen.line(e); ul.append(li); });
      box.append(ul);
    }
    if (w.note) { const n = document.createElement("p"); n.className = "session-tip"; n.textContent = w.note; box.append(n); }
    if (w.needs_details || rows.length <= 1) {
      const n = document.createElement("p"); n.className = "session-tip"; n.textContent = "Noch keine Werte eingetragen – wie lange ging es, wie hat es sich angefühlt?"; box.append(n);
    }
    return box;
  }

  // „📅 Verschoben von Mittwoch, 18.11.“
  function movedLine(fromIso) {
    const d = document.createElement("div"); d.className = "session-moved";
    d.textContent = "📅 Verschoben von " + parse(fromIso).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "numeric" });
    return d;
  }

  function togetherPill(partner) {
    const t = document.createElement("span");
    t.className = "pill together-pill";
    t.textContent = "👫 " + (partner ? "mit " + partner.name : "zusammen");
    return t;
  }

  // Kompakte Zeile: was der Trainingspartner an diesem Tag macht
  function partnerLine(partner, list, done, repl, skip) {
    const row = document.createElement("div");
    row.className = "partner-line";
    const who = document.createElement("b"); who.textContent = partner.name + ":";
    row.append(who);
    list.forEach((s) => {
      const sp = SPORT[s.sport] || SPORT.other;
      const it = document.createElement("span"); it.className = "pl-item" + (done.has(s.id) ? " done" : "") + (repl.has(s.id) || skip.has(s.id) ? " repl" : "");
      const dot = document.createElement("span"); dot.className = "sdot"; dot.style.background = sp.color;
      it.append(dot, document.createTextNode([sp.label, s.duration_min ? s.duration_min + " Min." : null].filter(Boolean).join(" ")
        + (s.together ? " 👫" : "") + (s.optional ? " (optional)" : "") + (s.moved_from ? " 📅" : "") + (done.has(s.id) ? " ✓" : "") + (repl.has(s.id) ? " · 🔁 anderes Training" : "") + (skip.has(s.id) && !done.has(s.id) && !repl.has(s.id) ? " · abgesagt" : "")));
      row.append(it);
    });
    return row;
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
      const done = new Set([...(p.done || []), ...(p.replaced || []), ...(p.skipped || [])]);
      (Array.isArray(p.sessions) ? p.sessions : []).forEach((s, i) => {
        const d = dayDate(p.week_start, s.day);
        if (d >= today && !done.has(s.id)) all.push({ plan: p, s, d, i });
      });
    });
    all.sort((a, b) => (a.d - b.d) || (a.i - b.i));
    if (!all.length) return null;
    // Frühester Tag zuerst (auch wenn optional); am selben Tag hat eine Pflicht-Einheit Vorrang
    const first = all[0].d.getTime();
    const sameDay = all.filter((x) => x.d.getTime() === first);
    return sameDay.find((x) => !x.s.optional) || sameDay[0];
  }

  function weekProgress() {
    const cur = plans.find((p) => p.week_start === iso(thisMonday()));
    if (!cur) return null;
    return Object.assign(stats(cur), { free: freeWeek });
  }

  // Verpasste Pflicht-Einheiten dieser Woche (Tag vorbei, weder erledigt noch ersetzt)
  function missed() {
    const cur = plans.find((p) => p.week_start === iso(thisMonday()));
    if (!cur) return [];
    const today = parse(iso(new Date()));
    const done = new Set([...(cur.done || []), ...(cur.replaced || []), ...(cur.skipped || [])]);
    return (cur.sessions || []).filter((s) => !s.optional && !done.has(s.id) && dayDate(cur.week_start, s.day) < today)
      .map((s) => ({ plan: cur, s, d: dayDate(cur.week_start, s.day) }));
  }

  // Eingetragene Wochen ohne Plan (diese oder nächste Woche)
  async function pendingWeeks() {
    if (!me) return [];
    const { data } = await db.from("week_availability").select("week_start, updated_at")
      .eq("user_id", me.id).gte("week_start", iso(thisMonday())).order("week_start").limit(2);
    const byWeek = Object.fromEntries(plans.map((p) => [p.week_start, p]));
    const out = [];
    replanWeeks = new Set();
    (data || []).forEach((r) => {
      const plan = byWeek[r.week_start];
      if (!plan) out.push({ week: r.week_start, replan: false });
      else if (plan.plan_written_at && new Date(r.updated_at) > new Date(plan.plan_written_at)) {
        out.push({ week: r.week_start, replan: true });
        replanWeeks.add(r.week_start);
      }
    });
    return out;
  }

  function editWeekButton(ws, label) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "secondary"; b.textContent = label || "Woche überarbeiten";
    b.addEventListener("click", () => { Woche.focusWeek(ws); Woche.render(); showTab("plan", "week-card"); });
    return b;
  }

  async function renderToday() {
    const body = $("today-body");
    if (!body) return;
    const pending = await pendingWeeks();
    body.innerHTML = "";
    const pend = $("today-pending");
    if (pend) pend.remove();
    const title = $("today-title");
    const actions = document.createElement("div"); actions.className = "today-actions";

    if (!plans.length) {
      title.textContent = "Dein Plan";
      if (pending.length) {
        const st = document.createElement("div"); st.className = "today-when"; st.style.color = "var(--ok)";
        st.textContent = "Woche eingetragen ✓";
        const p = document.createElement("p"); p.style.margin = "0";
        p.textContent = "Claude erstellt deinen Plan für " + rangeText(pending[0].week) + ", du bekommst eine Benachrichtigung, sobald er da ist.";
        actions.append(editWeekButton(pending[0].week));
        body.append(st, p, actions);
        return;
      }
      const p = document.createElement("p"); p.className = "hint"; p.style.margin = "0";
      const hasSetup = typeof Setup !== "undefined" && Setup.exists();
      p.textContent = hasSetup ? "Claude erstellt gerade deinen Saisonplan und die nächsten 4 Wochen." : "Noch kein Plan. Leg deine Trainingswoche fest, dann plant Claude deine Saison bis zum Wettkampf.";
      const b = document.createElement("button"); b.type = "button"; b.textContent = hasSetup ? "Zum Saisonplan" : "Trainingswoche festlegen";
      b.addEventListener("click", () => showTab("plan", hasSetup ? "season-card" : "setup-card"));
      actions.append(b);
      body.append(p, actions);
      return;
    }

    const nx = nextSession();
    const prog = weekProgress();
    if (!nx) {
      const allDone = prog && prog.total && prog.n === prog.total;
      title.textContent = allDone ? "Geschafft" : "Dein Plan";
      const p = document.createElement("p"); p.style.margin = "0";
      p.textContent = allDone ? "Alle geplanten Einheiten der Woche erledigt. Stark! 🎉"
        : "Für diese Woche steht nichts mehr an. Hast du etwas gemacht, aber noch nicht abgehakt? Im Plan kannst du es nachtragen.";
      body.append(p);
    } else {
      const sp = SPORT[nx.s.sport] || SPORT.other;
      const isTod = isToday(nx.d);
      title.textContent = isTod ? "Heute" : "Als Nächstes";
      const when = document.createElement("div"); when.className = "today-when";
      when.textContent = nx.d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "short" });
      const wl = typeof Wetter !== "undefined" ? Wetter.label(iso(nx.d)) : "";
      if (wl) { const w = document.createElement("span"); w.className = "day-weather"; w.textContent = wl; when.append(w); }
      const item = document.createElement("div"); item.className = "today-item";
      const dot = document.createElement("span"); dot.className = "sdot"; dot.style.background = sp.color;
      const txt = document.createElement("div");
      const t = document.createElement("div"); t.className = "t"; t.textContent = nx.s.title;
      const partner = typeof Partner !== "undefined" ? Partner.get() : null;
      if (nx.s.together) { t.append(" "); t.append(togetherPill(partner)); }
      const m = document.createElement("div"); m.className = "m";
      m.textContent = [sp.label, nx.s.duration_min ? nx.s.duration_min + " Min." : null, nx.s.intensity].filter(Boolean).join(" · ");
      txt.append(t, m);
      if (nx.s.weather_note) {
        const wn = document.createElement("div"); wn.className = "session-weather"; wn.textContent = "☔ " + nx.s.weather_note;
        txt.append(wn);
      }
      const exToday = hasGym(nx.s) ? exTable(nx.s) : null;
      if (exToday) txt.append(exToday);
      else if (Array.isArray(nx.s.details) && nx.s.details.length) {
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
        Ergebnis.open(nx.plan, nx.s, () => draw());
      });
      if (hasGym(nx.s)) {
        const live = document.createElement("button"); live.type = "button"; live.textContent = "▶ Live starten";
        live.addEventListener("click", () => Gym.start({ week_start: nx.plan.week_start, session: nx.s }));
        doneBtn.className = "secondary";
        actions.append(live);
      }
      actions.append(doneBtn);
      const other = document.createElement("button"); other.type = "button"; other.className = "ghost today-other";
      other.textContent = "🔁 Anderes Training gemacht";
      other.addEventListener("click", () => Training.open(null, null, { replaces: { week_start: nx.plan.week_start, session_id: nx.s.id, day: iso(nx.d), title: nx.s.title } }));
      const mvb = document.createElement("button"); mvb.type = "button"; mvb.className = "ghost today-other";
      mvb.textContent = "📅 Auf einen anderen Tag verschieben";
      mvb.addEventListener("click", () => Move.open(nx.plan, nx.s));
      const cxb = document.createElement("button"); cxb.type = "button"; cxb.className = "ghost today-other";
      cxb.textContent = "✕ Absagen";
      cxb.addEventListener("click", () => Absage.open(nx.plan, nx.s));
      if (nx.d <= parse(iso(new Date()))) txt.append(other);
      txt.append(mvb, cxb);
    }
    const all = document.createElement("button"); all.type = "button"; all.className = "secondary"; all.textContent = "Ganzer Plan";
    all.dataset.goto = "plan"; all.dataset.scroll = "plan-card";
    actions.append(all);
    body.append(actions);
    missed().forEach((x) => {
      const sp = SPORT[x.s.sport] || SPORT.other;
      const row = document.createElement("div"); row.className = "missed-row";
      const t = document.createElement("div");
      const b1 = document.createElement("b"); b1.textContent = "Noch offen: " + x.s.title;
      const s1 = document.createElement("span"); s1.className = "hint";
      s1.textContent = sp.label + " · geplant für " + x.d.toLocaleDateString("de-DE", { weekday: "long" });
      t.append(b1, s1);
      const btns = document.createElement("div"); btns.className = "missed-btns";
      const mv = document.createElement("button"); mv.type = "button"; mv.className = "secondary"; mv.textContent = "📅 Verschieben";
      mv.addEventListener("click", () => Move.open(x.plan, x.s));
      const ot = document.createElement("button"); ot.type = "button"; ot.className = "ghost"; ot.textContent = "🔁 Anderes gemacht";
      ot.addEventListener("click", () => Training.open(null, null, { replaces: { week_start: x.plan.week_start, session_id: x.s.id, day: iso(x.d), title: x.s.title } }));
      const cx = document.createElement("button"); cx.type = "button"; cx.className = "ghost"; cx.textContent = "✕ Absagen";
      cx.addEventListener("click", () => Absage.open(x.plan, x.s));
      btns.append(mv, ot, cx);
      row.append(t, btns);
      body.append(row);
    });
    if (prog && (prog.total || prog.free || prog.k)) {
      const p = document.createElement("p"); p.className = "hint"; p.style.margin = "12px 0 0";
      const trainings = prog.made + prog.free;
      const parts = ["Diese Woche: " + trainings + (trainings === 1 ? " Training" : " Trainings") + " gemacht"];
      if (prog.total) parts.push(prog.n + " von " + prog.total + " geplanten Einheiten");
      if (prog.free) parts.push(prog.free + (prog.free === 1 ? " freies Training" : " freie Trainings"));
      if (prog.r) parts.push(prog.r + " ersetzt");
      if (prog.k) parts.push(prog.k + " abgesagt");
      p.textContent = parts.join(" · ");
      body.append(p);
    }
    // Geänderte Wochen ganz oben, neu eingetragene Wochen ohne Plan unten
    pending.forEach((pw) => {
      const box = document.createElement("div");
      box.className = "pending-row" + (pw.replan ? " replan" : "");
      const t = document.createElement("div");
      const b1 = document.createElement("b");
      const s1 = document.createElement("span"); s1.className = "hint";
      if (pw.replan) {
        b1.textContent = "Dein neuer Trainingsplan wird erstellt";
        s1.textContent = "Du hast die Woche " + rangeText(pw.week) + " geändert. Bis der neue Plan da ist, gilt der bisherige.";
      } else {
        b1.textContent = "Woche " + rangeText(pw.week) + " eingetragen ✓";
        s1.textContent = "Plan kommt bald.";
      }
      t.append(b1, s1);
      box.append(t, editWeekButton(pw.week, "Überarbeiten"));
      if (pw.replan) body.prepend(box); else body.append(box);
    });
  }

  return { render, renderToday, weeks: () => plans, dayDate, iso, parse, DAYS };
})();
