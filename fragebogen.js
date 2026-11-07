// Fragebogen zum Trainingsstatus.
// Die Antworten landen in der Tabelle athlete_status (nur für die Person selbst lesbar).
// Fragen ändern oder ergänzen: einfach unten in SECTIONS bearbeiten.

const Fragebogen = (() => {
  const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  const SECTIONS = [
    {
      id: "person", title: "Über dich",
      intro: "Ein paar Eckdaten, damit Belastung und Pulsbereiche zu dir passen.",
      fields: [
        { id: "birth_year", label: "Geburtsjahr", type: "number", min: 1930, max: 2015, placeholder: "z. B. 1996" },
        { id: "height_cm", label: "Größe", type: "number", unit: "cm", min: 120, max: 220 },
        { id: "weight_kg", label: "Gewicht", type: "number", unit: "kg", min: 30, max: 200, optional: true },
        { id: "sex", label: "Geschlecht", type: "choice", optional: true,
          hint: "Hilft bei der Einschätzung von Puls und Belastung.",
          options: ["weiblich", "männlich", "divers", "keine Angabe"] },
        { id: "daily_activity", label: "Wie aktiv ist dein Alltag?", type: "choice",
          options: ["meist sitzend", "gemischt", "körperlich aktiv"] }
      ]
    },
    {
      id: "goal", title: "Dein Ziel",
      intro: "Was willst du in Dortmund erreichen?",
      fields: [
        { id: "goal", label: "Hauptziel", type: "choice",
          options: ["Ankommen", "Mit Spaß und gutem Gefühl ankommen", "Eine bestimmte Zielzeit", "Möglichst weit vorne landen"] },
        { id: "target_time", label: "Welche Zielzeit?", type: "time", placeholder: "h:mm, z. B. 2:45", unknown: true,
          when: (a) => a.goal === "Eine bestimmte Zielzeit" },
        { id: "tri_experience", label: "Triathlon-Erfahrung", type: "choice",
          options: ["Noch nie gemacht", "Schon einmal", "Mehrfach"] },
        { id: "motivation", label: "Was ist dir wichtig? Was motiviert dich?", type: "textarea", optional: true,
          placeholder: "z. B. fitter werden, gemeinsam mit der Familie, endlich gut laufen können …" }
      ]
    },
    {
      id: "health", title: "Gesundheit",
      intro: "Damit der Plan dich nicht überfordert. Diese Angaben sind privat.",
      fields: [
        { id: "complaints_now", label: "Hast du aktuell Beschwerden oder Verletzungen?", type: "textarea", optional: true,
          placeholder: "z. B. Knie zwickt nach langen Läufen. Leer lassen, wenn nichts ist." },
        { id: "injuries_past", label: "Frühere Verletzungen, die noch eine Rolle spielen", type: "textarea", optional: true,
          placeholder: "z. B. Bänderriss 2022, Rückenprobleme" },
        { id: "medical", label: "Erkrankungen oder Medikamente, die beim Sport wichtig sind", type: "textarea", optional: true,
          placeholder: "z. B. Asthma, Blutdruck-Medikamente" },
        { id: "checkup", label: "Sportmedizinischer Check in den letzten 2 Jahren?", type: "choice",
          options: ["Ja", "Nein", "Ist geplant"] },
        { id: "sleep_h", label: "Wie viele Stunden schläfst du im Schnitt?", type: "number", unit: "h", min: 3, max: 12, step: 0.5 },
        { id: "stress", label: "Wie stressig ist dein Alltag gerade?", type: "scale",
          low: "entspannt", high: "sehr stressig" }
      ]
    },
    {
      id: "swim", title: "Schwimmen", color: "var(--swim)",
      intro: "1,5 km (Olympisch) bzw. ca. 750 m (Sprint) im Hafenbecken.",
      fields: [
        { id: "swim_style", label: "Wie schwimmst du?", type: "choice",
          options: ["Kraul, sicher", "Kraul, aber nicht lange am Stück", "Hauptsächlich Brust"] },
        { id: "swim_max_m", label: "Längste Strecke am Stück ohne Pause", type: "number", unit: "m", min: 0, max: 10000,
          placeholder: "z. B. 400", unknown: true },
        { id: "swim_pace", label: "Zeit pro 100 m (lockeres Tempo)", type: "time", placeholder: "mm:ss, z. B. 2:10",
          unknown: true },
        { id: "swim_per_week", label: "Wie oft schwimmst du aktuell pro Woche?", type: "choice",
          options: ["Gar nicht", "Seltener als 1×", "1×", "2×", "3× oder mehr"] },
        { id: "pool_access", label: "Hast du Zugang zu einem Schwimmbad?", type: "choice", options: ["Ja", "Nein"] },
        { id: "pool_length", label: "Bahnlänge", type: "choice", options: ["25 m", "50 m", "weiß nicht"],
          when: (a) => a.pool_access === "Ja" },
        { id: "pool_times", label: "Wann kannst du ins Bad? (Öffnungszeiten, Bahnen)", type: "text", optional: true,
          placeholder: "z. B. Mo und Mi ab 18 Uhr, Sa morgens", when: (a) => a.pool_access === "Ja" },
        { id: "open_water", label: "Erfahrung im Freiwasser (See, Meer)?", type: "choice",
          options: ["Keine", "Ein bisschen", "Viel"] },
        { id: "wetsuit", label: "Neoprenanzug zum Schwimmen?", type: "choice",
          options: ["Habe ich", "Leihe ich", "Noch nicht"] }
      ]
    },
    {
      id: "bike", title: "Radfahren", color: "var(--bike)",
      intro: "40 km (Olympisch) bzw. ca. 20 km (Sprint).",
      fields: [
        { id: "bike_type", label: "Welches Rad hast du?", type: "multi",
          options: ["Rennrad", "Triathlon-/Zeitfahrrad", "Gravel/Cross", "Mountainbike", "Trekking/City", "Keins"] },
        { id: "bike_km_year", label: "Wie viele km bist du im letzten Jahr gefahren (Sport, nicht Alltag)?", type: "number",
          unit: "km", min: 0, max: 50000, unknown: true, hint: "Grobe Schätzung reicht." },
        { id: "bike_per_week", label: "Wie oft fährst du aktuell pro Woche (Sport)?", type: "choice",
          options: ["Gar nicht", "Seltener als 1×", "1×", "2×", "3× oder mehr"] },
        { id: "bike_longest_km", label: "Längste Fahrt in den letzten Monaten", type: "number", unit: "km", min: 0, max: 400, unknown: true },
        { id: "bike_speed", label: "Durchschnittstempo bei längeren Fahrten (flach)", type: "number", unit: "km/h",
          min: 5, max: 50, unknown: true },
        { id: "bike_commute", label: "Fährst du im Alltag Rad (z. B. zur Arbeit)?", type: "choice",
          options: ["Nein", "Ab und zu", "Regelmäßig"] },
        { id: "bike_indoor", label: "Was hast du für drinnen?", type: "multi", optional: true,
          options: ["Rollentrainer", "Smarttrainer", "Spinning im Studio", "Nichts davon"] },
        { id: "clipless", label: "Fährst du mit Klickpedalen?", type: "choice", options: ["Ja", "Nein"] }
      ]
    },
    {
      id: "run", title: "Laufen", color: "var(--run)",
      intro: "10 km (Olympisch) bzw. ca. 5 km (Sprint).",
      fields: [
        { id: "run_per_week", label: "Wie oft läufst du aktuell pro Woche?", type: "choice",
          options: ["Gar nicht", "Seltener als 1×", "1×", "2×", "3× oder mehr"] },
        { id: "run_km_week", label: "Wie viele km pro Woche ungefähr?", type: "number", unit: "km", min: 0, max: 200, unknown: true,
          when: (a) => a.run_per_week && a.run_per_week !== "Gar nicht" },
        { id: "run_longest_km", label: "Längster Lauf in den letzten Monaten", type: "number", unit: "km", min: 0, max: 100, unknown: true },
        { id: "run_5k", label: "Zeit für 5 km (aktuell)", type: "time", placeholder: "mm:ss, z. B. 29:30", unknown: true },
        { id: "run_10k", label: "Zeit für 10 km (aktuell)", type: "time", placeholder: "mm:ss oder h:mm:ss", unknown: true },
        { id: "run_easy_pace", label: "Tempo bei lockeren Läufen", type: "time", unit: "min/km", placeholder: "z. B. 6:45",
          unknown: true },
        { id: "run_complaints", label: "Hast du beim Laufen typischerweise Beschwerden?", type: "text", optional: true,
          placeholder: "z. B. Schienbein, Knie, Achillessehne" },
        { id: "run_shoes", label: "Wie alt sind deine Laufschuhe?", type: "choice",
          options: ["Unter 1 Jahr", "1–2 Jahre", "Älter", "Habe keine richtigen"] }
      ]
    },
    {
      id: "other", title: "Sonst noch Sport?",
      intro: "Alles zählt, auch Fußball, Yoga oder Wandern.",
      fields: [
        { id: "other_sports", label: "Welche anderen Sportarten machst du und wie oft?", type: "textarea", optional: true,
          placeholder: "z. B. Fußball 1× pro Woche, Yoga am Sonntag" },
        { id: "strength", label: "Machst du Krafttraining?", type: "choice",
          options: ["Nein", "Ab und zu", "Regelmäßig"] },
        { id: "gym", label: "Hast du Zugang zu einem Fitnessstudio?", type: "choice", options: ["Ja", "Nein"] }
      ]
    },
    {
      id: "time", title: "Zeit und Alltag",
      intro: "Das Wichtigste für einen Plan, der wirklich in dein Leben passt.",
      fields: [
        { id: "hours_week", label: "Wie viele Stunden pro Woche kannst du realistisch trainieren?", type: "range",
          min: 2, max: 15, step: 0.5, unit: "h", default: 5 },
        { id: "days", label: "An welchen Tagen kannst du meistens?", type: "multi", options: DAYS },
        { id: "daytime", label: "Wann trainierst du am liebsten?", type: "multi",
          options: ["Früh morgens", "Mittags", "Nach der Arbeit", "Spät abends"] },
        { id: "long_session_min", label: "Längste Einheit, die am Wochenende drin ist", type: "choice",
          options: ["1 Stunde", "1,5 Stunden", "2 Stunden", "3 Stunden oder mehr"] },
        { id: "fixed", label: "Feste Termine oder Einschränkungen", type: "textarea", optional: true,
          placeholder: "z. B. Di Fußball, Do Kinder abholen, Schichtdienst" },
        { id: "travel", label: "Bekannte Urlaube oder Reisen bis Juli", type: "textarea", optional: true,
          placeholder: "z. B. Skiurlaub 15.–22. Februar" }
      ]
    },
    {
      id: "tech", title: "Uhr und Daten",
      intro: "Damit wir wissen, welche Werte du messen kannst.",
      fields: [
        { id: "watch", label: "Hast du eine Sportuhr?", type: "choice",
          options: ["Keine", "Ja, ohne Puls", "Ja, Puls am Handgelenk", "Ja, mit Brustgurt"] },
        { id: "watch_model", label: "Welche Uhr?", type: "text", optional: true, placeholder: "z. B. Apple Watch, Garmin Forerunner",
          when: (a) => a.watch && a.watch !== "Keine" },
        { id: "rest_hr", label: "Ruhepuls (morgens im Liegen)", type: "number", unit: "bpm", min: 30, max: 110, unknown: true,
          hint: "Steht oft in der Uhr-App." },
        { id: "max_hr", label: "Maximalpuls", type: "number", unit: "bpm", min: 120, max: 230, unknown: true },
        { id: "apps", label: "Nutzt du eine Trainings-App?", type: "multi", optional: true,
          options: ["Apple Fitness/Health", "Garmin Connect", "Strava", "Andere", "Keine"] }
      ]
    },
    {
      id: "prefs", title: "Deine Vorlieben",
      intro: "Fast geschafft!",
      fields: [
        { id: "together", label: "Trainierst du lieber allein oder gemeinsam?", type: "choice",
          options: ["Lieber allein", "Egal", "Lieber gemeinsam"] },
        { id: "favorite", label: "Was machst du am liebsten?", type: "choice", optional: true,
          options: ["Schwimmen", "Radfahren", "Laufen"] },
        { id: "least", label: "Und was am wenigsten?", type: "choice", optional: true,
          options: ["Schwimmen", "Radfahren", "Laufen"] },
        { id: "wishes", label: "Was soll dein Trainingsplan unbedingt berücksichtigen?", type: "textarea", optional: true,
          placeholder: "Alles, was dir sonst noch wichtig ist." }
      ]
    }
  ];

  const UNKNOWN = "weiß nicht";

  let answers = {};
  let completedAt = null;
  let step = 0;
  let loaded = false;

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const visible = (f) => !f.when || f.when(answers);
  const isEmpty = (v) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

  // ---------- Laden und Speichern ----------
  async function load() {
    const { data, error } = await db.from("athlete_status")
      .select("answers, completed_at").eq("user_id", me.id).maybeSingle();
    if (error) throw error;
    answers = (data && data.answers) || {};
    completedAt = data ? data.completed_at : null;
    loaded = true;
  }

  async function save(complete) {
    const row = { user_id: me.id, answers };
    if (complete) row.completed_at = new Date().toISOString();
    const { error } = await db.from("athlete_status").upsert(row, { onConflict: "user_id" });
    if (error) throw error;
    if (complete) completedAt = row.completed_at;
  }

  function progress() {
    if (completedAt) return 100;
    let total = 0, done = 0;
    SECTIONS.forEach((s) => s.fields.forEach((f) => {
      if (!visible(f) || f.optional) return;
      total++;
      if (!isEmpty(answers[f.id])) done++;
    }));
    return total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  }

  // ---------- Karte auf der eigenen Seite ----------
  async function renderCard() {
    const box = $("quiz-card");
    if (!box) return;
    try { await load(); } catch (e) { $("quiz-status").textContent = translate(e); return; }
    const pct = progress();
    $("quiz-bar").style.width = pct + "%";
    const btn = $("quiz-open");
    if (completedAt) {
      const d = new Date(completedAt).toLocaleDateString("de-DE", { day: "numeric", month: "long" });
      $("quiz-status").textContent = "Ausgefüllt am " + d + ". Danke! Du kannst deine Angaben jederzeit anpassen.";
      btn.textContent = "Angaben ansehen und ändern";
      btn.classList.add("secondary");
    } else if (Object.keys(answers).length) {
      $("quiz-status").textContent = pct + " % ausgefüllt. Mach weiter, wo du aufgehört hast.";
      btn.textContent = "Fragebogen fortsetzen";
      btn.classList.remove("secondary");
    } else {
      $("quiz-status").textContent = "Ungefähr 10 Minuten. Damit kann dein Plan genau auf dich zugeschnitten werden.";
      btn.textContent = "Fragebogen starten";
      btn.classList.remove("secondary");
    }
  }

  // ---------- Fragebogen ----------
  async function open() {
    if (!loaded) {
      try { await load(); } catch (e) { return alert(translate(e)); }
    }
    // Beim Fortsetzen beim ersten unvollständigen Schritt einsteigen
    step = 0;
    if (!completedAt) {
      const firstOpen = SECTIONS.findIndex((s) => s.fields.some((f) => visible(f) && !f.optional && isEmpty(answers[f.id])));
      step = firstOpen === -1 ? SECTIONS.length - 1 : firstOpen;
    }
    show("quiz");
    renderStep();
    window.scrollTo(0, 0);
  }

  function renderStep() {
    const s = SECTIONS[step];
    $("quiz-step").textContent = "Schritt " + (step + 1) + " von " + SECTIONS.length;
    $("quiz-progress").style.width = Math.round(((step + 1) / SECTIONS.length) * 100) + "%";
    const title = $("quiz-title");
    title.textContent = s.title;
    title.style.setProperty("--dot", s.color || "transparent");
    title.classList.toggle("dot", !!s.color);
    $("quiz-intro").textContent = s.intro || "";
    $("quiz-msg").textContent = "";
    $("quiz-back").style.visibility = step === 0 ? "hidden" : "visible";
    $("quiz-next").textContent = step === SECTIONS.length - 1 ? "Abschließen" : "Weiter";

    const box = $("quiz-fields");
    box.innerHTML = "";
    s.fields.forEach((f) => {
      if (!visible(f)) return;
      box.append(renderField(f));
    });
  }

  function rerenderKeepingFocus() {
    // Nach Antworten mit Bedingungen neu zeichnen (Felder ein-/ausblenden)
    const y = window.scrollY;
    renderStep();
    window.scrollTo(0, y);
  }

  function renderField(f) {
    const wrap = el("div", "field q");
    const id = "q-" + f.id;
    const label = el("label", null, f.label);
    if (["choice", "multi", "scale"].includes(f.type)) label.id = id + "-label";
    else label.htmlFor = id;
    if (f.optional) label.append(el("span", "opt", " (optional)"));
    wrap.append(label);

    const hasConditionalDeps = SECTIONS[step].fields.some((x) => x.when && String(x.when).includes(f.id));
    const val = answers[f.id];

    if (f.type === "choice" || f.type === "multi") {
      const multi = f.type === "multi";
      const group = el("div", "chips");
      group.setAttribute("role", multi ? "group" : "radiogroup");
      group.setAttribute("aria-labelledby", id + "-label");
      f.options.forEach((opt) => {
        const b = el("button", "chip", opt);
        b.type = "button";
        const on = multi ? (val || []).includes(opt) : val === opt;
        b.setAttribute("aria-pressed", on);
        b.addEventListener("click", () => {
          if (multi) {
            let list = Array.isArray(answers[f.id]) ? [...answers[f.id]] : [];
            const exclusive = ["Keins", "Keine", "Nichts davon"];
            if (list.includes(opt)) list = list.filter((x) => x !== opt);
            else if (exclusive.includes(opt)) list = [opt];
            else list = list.filter((x) => !exclusive.includes(x)).concat(opt);
            answers[f.id] = list;
            group.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", list.includes(c.textContent)));
          } else {
            answers[f.id] = answers[f.id] === opt && f.optional ? "" : opt;
            group.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", c.textContent === answers[f.id]));
          }
          if (hasConditionalDeps) rerenderKeepingFocus();
        });
        group.append(b);
      });
      wrap.append(group);
    } else if (f.type === "scale") {
      const group = el("div", "chips scale");
      group.setAttribute("role", "radiogroup");
      group.setAttribute("aria-labelledby", id + "-label");
      for (let i = 1; i <= 5; i++) {
        const b = el("button", "chip", String(i));
        b.type = "button";
        b.setAttribute("aria-pressed", val === i);
        b.addEventListener("click", () => {
          answers[f.id] = i;
          group.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", Number(c.textContent) === i));
        });
        group.append(b);
      }
      wrap.append(group);
      const ends = el("div", "scale-ends");
      ends.append(el("span", null, f.low), el("span", null, f.high));
      wrap.append(ends);
    } else if (f.type === "range") {
      const row = el("div", "range-row");
      const input = document.createElement("input");
      input.type = "range"; input.id = id;
      input.min = f.min; input.max = f.max; input.step = f.step || 1;
      const current = val != null ? val : f.default;
      input.value = current;
      const out = el("output", "range-val", fmtNum(current) + " " + f.unit);
      if (val == null) answers[f.id] = Number(current);
      input.addEventListener("input", () => {
        answers[f.id] = Number(input.value);
        out.textContent = fmtNum(input.value) + " " + f.unit;
      });
      row.append(input, out);
      wrap.append(row);
    } else if (f.type === "textarea") {
      const t = document.createElement("textarea");
      t.id = id; t.rows = 3; t.maxLength = 1000;
      t.placeholder = f.placeholder || "";
      t.value = val || "";
      t.addEventListener("input", () => { answers[f.id] = t.value; });
      wrap.append(t);
    } else {
      const row = el("div", "input-unit");
      const input = document.createElement("input");
      input.id = id;
      input.type = "text";
      input.autocomplete = "off";
      input.placeholder = f.placeholder || "";
      if (f.type === "number") input.inputMode = (f.step && f.step < 1) ? "decimal" : "numeric";
      if (f.type === "time") input.inputMode = "text";
      const isUnknown = val === UNKNOWN;
      input.value = val != null && !isUnknown ? (f.type === "number" ? fmtNum(val) : val) : "";
      input.disabled = isUnknown;
      input.addEventListener("input", () => {
        const raw = input.value.trim();
        if (f.type === "number") {
          const n = parseFloat(raw.replace(",", "."));
          answers[f.id] = raw === "" || isNaN(n) ? "" : n;
        } else {
          answers[f.id] = raw;
        }
        if (hasConditionalDeps) rerenderKeepingFocus();
      });
      row.append(input);
      if (f.unit) row.append(el("span", "unit", f.unit));
      wrap.append(row);
      if (f.unknown) {
        const chips = el("div", "chips unknown");
        const b = el("button", "chip", "Weiß ich noch nicht");
        b.type = "button";
        b.setAttribute("aria-pressed", isUnknown);
        b.addEventListener("click", () => {
          const on = answers[f.id] !== UNKNOWN;
          answers[f.id] = on ? UNKNOWN : "";
          b.setAttribute("aria-pressed", on);
          input.disabled = on;
          input.value = "";
          if (!on) input.focus();
        });
        chips.append(b);
        wrap.append(chips);
      }
    }

    if (f.hint) wrap.append(el("div", "hint", f.hint));
    return wrap;
  }

  function fmtNum(v) {
    return String(v).replace(".", ",");
  }

  function validateStep() {
    const s = SECTIONS[step];
    for (const f of s.fields) {
      if (!visible(f)) continue;
      const v = answers[f.id];
      if (isEmpty(v)) {
        if (f.optional) continue;
        return "Bitte noch beantworten: „" + f.label + "“" + (f.unknown ? " (oder „Weiß ich noch nicht“ wählen)" : "");
      }
      if (v === UNKNOWN) continue;
      if (f.type === "number" && (typeof v !== "number" || (f.min != null && v < f.min) || (f.max != null && v > f.max))) {
        return "„" + f.label + "“: Bitte eine Zahl zwischen " + f.min + " und " + f.max + " eingeben.";
      }
      if (f.type === "time" && !/^\d{1,2}:\d{2}(:\d{2})?$/.test(v)) {
        return "„" + f.label + "“: Bitte im Format " + (f.placeholder || "mm:ss").split(",")[0] + " eingeben.";
      }
    }
    // Ausgeblendete Antworten entfernen, damit nichts Veraltetes gespeichert bleibt
    s.fields.forEach((f) => { if (!visible(f)) delete answers[f.id]; });
    return null;
  }

  async function next() {
    const problem = validateStep();
    if (problem) {
      const m = $("quiz-msg"); m.textContent = problem; m.className = "msg error";
      return;
    }
    const last = step === SECTIONS.length - 1;
    const btn = $("quiz-next");
    btn.disabled = true;
    try {
      await save(last);
    } catch (e) {
      btn.disabled = false;
      const m = $("quiz-msg"); m.textContent = translate(e); m.className = "msg error";
      return;
    }
    btn.disabled = false;
    if (last) {
      show("home");
      renderCard();
      window.scrollTo(0, 0);
      return;
    }
    step++;
    renderStep();
    window.scrollTo(0, 0);
  }

  async function back() {
    if (step === 0) return;
    try { await save(false); } catch (e) { /* Zurück geht auch ohne Speichern */ }
    step--;
    renderStep();
    window.scrollTo(0, 0);
  }

  async function close() {
    try { await save(false); } catch (e) {}
    show("home");
    renderCard();
  }

  function bind() {
    $("quiz-open").addEventListener("click", open);
    $("quiz-next").addEventListener("click", next);
    $("quiz-back").addEventListener("click", back);
    $("quiz-close").addEventListener("click", close);
  }

  function reset() {
    answers = {}; completedAt = null; loaded = false; step = 0;
  }

  return { bind, renderCard, reset, SECTIONS };
})();
