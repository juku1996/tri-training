// Gym live: Krafttraining Satz für Satz mitschreiben, mit Pausen-Timer.
// Läuft für eine geplante Kraft-Einheit (→ session_results + abhaken) oder frei (→ workouts).
// Der Zwischenstand liegt im Browser (localStorage), damit nichts verloren geht,
// wenn das Handy zwischendurch die App schließt.

const Gym = (() => {
  const KEY = "tri-gym-live";
  const REST_DEFAULT = 90;
  let st = null;               // { ctx, title, started_at, exercises: [{ name, sets: [{ reps, kg, done }] }], rest }
  let tick = null, restEnd = null, wakeLock = null;

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } };
  const persist = () => { try { if (st) localStorage.setItem(KEY, JSON.stringify(st)); else localStorage.removeItem(KEY); } catch (e) { /* privat/voll: dann eben nur im Speicher */ } };
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (sec) => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (h ? h + ":" + pad(m) : m) + ":" + pad(s); };
  const fmtKg = (v) => v == null || v === "" ? "" : String(v).replace(".", ",");
  const todayIso = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };

  // Letzte Werte je Übung (eigene Daten): Name → { reps, kg, sets }
  async function lastByName() {
    const map = {};
    const [w, r] = await Promise.all([
      db.from("workouts").select("exercises, updated_at").eq("user_id", me.id).not("exercises", "is", null).order("updated_at", { ascending: false }).limit(20),
      db.from("session_results").select("values, updated_at").eq("user_id", me.id).not("values->exercises", "is", null).order("updated_at", { ascending: false }).limit(20)
    ]);
    const rows = [...(w.data || []).map((x) => ({ t: x.updated_at, ex: x.exercises })),
                  ...(r.data || []).map((x) => ({ t: x.updated_at, ex: x.values && x.values.exercises }))]
      .filter((x) => Array.isArray(x.ex)).sort((a, b) => new Date(b.t) - new Date(a.t));
    rows.forEach((x) => x.ex.forEach((e) => {
      const k = (e.name || "").trim().toLowerCase();
      if (k && !map[k]) map[k] = e;
    }));
    return { map, lastList: rows.length ? rows[0].ex : [] };
  }

  function makeSets(n, reps, kg) {
    return Array.from({ length: Math.max(1, Math.min(10, n || 3)) }, () => ({ reps: reps != null ? reps : "", kg: kg != null ? kg : "", done: false }));
  }

  // ---------- Start ----------
  async function start(ctx) {
    if (load() && !confirm("Es läuft schon ein Training. Verwerfen und neu starten?")) { resume(); return; }
    const { map, lastList } = await lastByName();
    let src = ctx.session && Array.isArray(ctx.session.exercises) && ctx.session.exercises.length ? ctx.session.exercises : lastList;
    const exercises = (src || []).map((e) => {
      const prev = map[(e.name || "").trim().toLowerCase()];
      return { name: e.name, hint: prev ? "Letztes Mal: " + Uebungen.line(prev) : "", sets: makeSets(e.sets || (prev && prev.sets), e.reps || (prev && prev.reps), prev ? prev.kg : null) };
    });
    st = {
      ctx: ctx.session ? { kind: "plan", week_start: ctx.week_start, session_id: ctx.session.id } : { kind: "free" },
      title: ctx.session ? ctx.session.title : "Gym-Training",
      started_at: Date.now(), rest: REST_DEFAULT,
      exercises: exercises.length ? exercises : [{ name: "", hint: "", sets: makeSets(3) }]
    };
    persist();
    open();
  }

  function resume() { st = load(); if (st) open(); }
  const running = () => !!load();

  // ---------- Ansicht ----------
  function open() {
    Uebungen.names(st.exercises.map((e) => e.name).filter(Boolean));
    $("gym-live").hidden = false;
    document.body.classList.add("gym-open");
    $("gym-title").textContent = st.title;
    draw();
    clearInterval(tick);
    tick = setInterval(update, 500);
    update();
    try { if (navigator.wakeLock) navigator.wakeLock.request("screen").then((l) => { wakeLock = l; }).catch(() => {}); } catch (e) { /* nicht unterstützt */ }
  }

  function hide() {
    $("gym-live").hidden = true;
    document.body.classList.remove("gym-open");
    clearInterval(tick); tick = null;
    try { if (wakeLock) wakeLock.release(); } catch (e) { /* egal */ }
    wakeLock = null;
    if (typeof renderGymBanner === "function") renderGymBanner();
  }

  function update() {
    if (!st) return;
    $("gym-clock").textContent = fmt((Date.now() - st.started_at) / 1000);
    const bar = $("gym-rest");
    if (restEnd) {
      const left = (restEnd - Date.now()) / 1000;
      if (left <= 0) {
        restEnd = null; bar.classList.add("over");
        $("gym-rest-time").textContent = "Weiter geht's!";
        try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { /* egal */ }
        setTimeout(() => { if (!restEnd) bar.hidden = true; bar.classList.remove("over"); }, 4000);
      } else {
        bar.hidden = false; bar.classList.remove("over");
        $("gym-rest-time").textContent = "Pause " + fmt(left);
        $("gym-rest-fill").style.width = Math.max(0, Math.min(100, left / st.rest * 100)) + "%";
      }
    }
  }

  function startRest() { restEnd = Date.now() + st.rest * 1000; update(); }

  function draw() {
    const box = $("gym-body");
    box.innerHTML = "";
    st.exercises.forEach((ex, ei) => {
      const card = document.createElement("div"); card.className = "gym-ex";
      const head = document.createElement("div"); head.className = "gym-ex-head";
      const name = document.createElement("input"); name.type = "text"; name.className = "gym-name";
      name.value = ex.name || ""; name.placeholder = "Übung, z. B. Kniebeuge"; name.setAttribute("list", "ex-names"); name.maxLength = 60;
      name.setAttribute("aria-label", "Name der Übung");
      name.addEventListener("change", () => { ex.name = name.value.trim(); persist(); });
      const del = document.createElement("button"); del.type = "button"; del.className = "ex-del"; del.textContent = "×";
      del.setAttribute("aria-label", "Übung entfernen");
      del.addEventListener("click", () => {
        if (ex.sets.some((s) => s.done) && !confirm("Übung mit erledigten Sätzen entfernen?")) return;
        st.exercises.splice(ei, 1); persist(); draw();
      });
      head.append(name, del);
      card.append(head);
      if (ex.hint) { const h = document.createElement("div"); h.className = "hint gym-hint"; h.textContent = ex.hint; card.append(h); }

      ex.sets.forEach((s, si) => {
        const row = document.createElement("div"); row.className = "gym-set" + (s.done ? " done" : "");
        const n = document.createElement("span"); n.className = "gym-n"; n.textContent = si + 1;
        const kg = document.createElement("input"); kg.type = "text"; kg.inputMode = "decimal"; kg.value = fmtKg(s.kg); kg.placeholder = "–";
        kg.setAttribute("aria-label", "Satz " + (si + 1) + ": Gewicht in kg");
        kg.addEventListener("change", () => { const v = kg.value.trim().replace(",", "."); s.kg = v === "" ? "" : Number(v); persist(); });
        const kgU = document.createElement("span"); kgU.className = "gym-u"; kgU.textContent = "kg";
        const reps = document.createElement("input"); reps.type = "text"; reps.inputMode = "numeric"; reps.value = s.reps; reps.placeholder = "Wdh.";
        reps.setAttribute("aria-label", "Satz " + (si + 1) + ": Wiederholungen");
        reps.addEventListener("change", () => { const v = reps.value.trim(); s.reps = v === "" ? "" : Number(v); persist(); });
        const rU = document.createElement("span"); rU.className = "gym-u"; rU.textContent = "Wdh.";
        const ok = document.createElement("button"); ok.type = "button"; ok.className = "check";
        ok.setAttribute("aria-pressed", s.done);
        ok.setAttribute("aria-label", "Satz " + (si + 1) + (s.done ? " erledigt" : " abhaken"));
        ok.addEventListener("click", () => {
          kg.dispatchEvent(new Event("change")); reps.dispatchEvent(new Event("change"));
          s.done = !s.done;
          // Werte in die nächsten offenen Sätze übernehmen, wenn dort noch nichts steht
          if (s.done) {
            ex.sets.slice(si + 1).forEach((o) => { if (!o.done) { if (o.kg === "" || o.kg == null) o.kg = s.kg; if (o.reps === "" || o.reps == null) o.reps = s.reps; } });
            startRest();
          }
          persist(); draw();
        });
        row.append(n, kg, kgU, reps, rU, ok);
        card.append(row);
      });
      const add = document.createElement("button"); add.type = "button"; add.className = "ghost gym-addset"; add.textContent = "＋ Satz";
      add.addEventListener("click", () => {
        const last = ex.sets[ex.sets.length - 1] || {};
        ex.sets.push({ reps: last.reps != null ? last.reps : "", kg: last.kg != null ? last.kg : "", done: false });
        persist(); draw();
      });
      card.append(add);
      box.append(card);
    });
    const addEx = document.createElement("button"); addEx.type = "button"; addEx.className = "secondary"; addEx.textContent = "＋ Übung";
    addEx.addEventListener("click", () => {
      st.exercises.push({ name: "", hint: "", sets: makeSets(3) }); persist(); draw();
      const inputs = box.querySelectorAll(".gym-name"); inputs[inputs.length - 1].focus();
    });
    box.append(addEx);
    $("gym-rest-len").textContent = fmt(st.rest);
    const doneSets = st.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
    $("gym-count").textContent = doneSets + (doneSets === 1 ? " Satz" : " Sätze");
  }

  // ---------- Beenden ----------
  function summarize() {
    return st.exercises.map((e) => {
      const done = e.sets.filter((s) => s.done);
      if (!e.name || !done.length) return null;
      const num = (v) => (v === "" || v == null || isNaN(Number(v))) ? null : Number(v);
      const log = done.map((s) => ({ reps: num(s.reps), kg: num(s.kg) }));
      const reps = log.map((x) => x.reps).filter((x) => x != null);
      const kgs = log.map((x) => x.kg).filter((x) => x != null);
      const freq = {}; reps.forEach((r) => { freq[r] = (freq[r] || 0) + 1; });
      const common = reps.length ? Number(Object.keys(freq).sort((a, b) => freq[b] - freq[a] || b - a)[0]) : null;
      return { name: e.name.slice(0, 60), sets: done.length, reps: common, kg: kgs.length ? Math.max(...kgs) : null, set_log: log };
    }).filter(Boolean).slice(0, 40);
  }

  function finishAsk() {
    const ex = summarize();
    const mins = Math.max(1, Math.round((Date.now() - st.started_at) / 60000));
    $("gym-fin-sum").textContent = ex.length
      ? ex.length + (ex.length === 1 ? " Übung" : " Übungen") + ", " + ex.reduce((n, e) => n + e.sets, 0) + " Sätze in " + mins + " Min."
      : "Noch kein Satz abgehakt.";
    $("gym-fin-dur").value = mins;
    $("gym-fin-kcal").value = "";
    $("gym-fin").dataset.feeling = "";
    document.querySelectorAll("#gym-fin-feeling .chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
    $("gym-fin-msg").textContent = "";
    $("gym-fin").hidden = false;
  }

  async function finishSave() {
    const msg = $("gym-fin-msg");
    const fail = (t) => { msg.textContent = t; msg.className = "msg error"; };
    const ex = summarize();
    if (!ex.length) return fail("Hak mindestens einen Satz ab (und gib der Übung einen Namen) – oder verwirf das Training.");
    const dur = Number($("gym-fin-dur").value);
    if (!Number.isInteger(dur) || dur < 1 || dur > 600) return fail("Dauer bitte in ganzen Minuten.");
    const kRaw = $("gym-fin-kcal").value.trim();
    const kcal = kRaw ? Math.round(Number(kRaw.replace(",", "."))) : null;
    if (kRaw && (isNaN(kcal) || kcal < 0 || kcal > 5000)) return fail("Kalorien bitte als Zahl.");
    const feeling = Number($("gym-fin").dataset.feeling) || null;
    const btn = $("gym-fin-save"); btn.disabled = true;
    let error = null;
    if (st.ctx.kind === "plan") {
      const values = { duration_min: dur, exercises: ex };
      if (kcal != null) values.calories = kcal;
      ({ error } = await db.from("session_results").upsert(
        { user_id: me.id, week_start: st.ctx.week_start, session_id: st.ctx.session_id, values, feeling },
        { onConflict: "user_id,week_start,session_id" }));
      if (!error) {
        const { data: p } = await db.from("training_plans").select("done").eq("user_id", me.id).eq("week_start", st.ctx.week_start).maybeSingle();
        const done = new Set((p && p.done) || []); done.add(st.ctx.session_id);
        ({ error } = await db.from("training_plans").update({ done: [...done] }).eq("user_id", me.id).eq("week_start", st.ctx.week_start));
      }
    } else {
      ({ error } = await db.from("workouts").insert({
        user_id: me.id, day: todayIso(), sport: "strength", title: "Gym", status: "erledigt",
        duration_min: dur, calories: kcal, feeling, exercises: ex.map(({ name, sets, reps, kg }) => ({ name, sets, reps, kg }))
      }));
    }
    btn.disabled = false;
    if (error) return fail(translate(error));
    $("gym-fin").hidden = true;
    st = null; restEnd = null; persist();
    hide();
    if (typeof Plan !== "undefined") Plan.render().then(() => Plan.renderToday());
    if (typeof Training !== "undefined") Training.render();
    if (typeof Bilanz !== "undefined") Bilanz.render();
  }

  function discard() {
    if (!confirm("Training verwerfen? Die eingetragenen Sätze gehen verloren.")) return;
    $("gym-fin").hidden = true;
    st = null; restEnd = null; persist(); hide();
  }

  function bind() {
    $("gym-min").addEventListener("click", hide);
    $("gym-finish").addEventListener("click", finishAsk);
    $("gym-fin-save").addEventListener("click", finishSave);
    $("gym-fin-back").addEventListener("click", () => { $("gym-fin").hidden = true; });
    $("gym-fin-discard").addEventListener("click", discard);
    $("gym-rest-skip").addEventListener("click", () => { restEnd = null; $("gym-rest").hidden = true; });
    $("gym-rest-minus").addEventListener("click", () => { st.rest = Math.max(15, st.rest - 15); persist(); $("gym-rest-len").textContent = fmt(st.rest); if (restEnd) restEnd -= 15000; });
    $("gym-rest-plus").addEventListener("click", () => { st.rest = Math.min(600, st.rest + 15); persist(); $("gym-rest-len").textContent = fmt(st.rest); if (restEnd) restEnd += 15000; });
    document.querySelectorAll("#gym-fin-feeling .chip").forEach((c) => c.addEventListener("click", () => {
      const v = c.dataset.v; const cur = $("gym-fin").dataset.feeling;
      $("gym-fin").dataset.feeling = cur === v ? "" : v;
      document.querySelectorAll("#gym-fin-feeling .chip").forEach((x) => x.setAttribute("aria-pressed", x.dataset.v === $("gym-fin").dataset.feeling));
    }));
    document.querySelectorAll("[data-gym-start]").forEach((b) => b.addEventListener("click", () => start({})));
  }

  return { bind, start, resume, running };
})();
