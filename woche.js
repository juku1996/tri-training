// Wochencheck: Wie viel Zeit hast du in der (nächsten) Woche?
// Speichert in week_availability (nur für die Person selbst lesbar).

const Woche = (() => {
  const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const OPTIONS = [
    { v: 0, t: "–" }, { v: 30, t: "30" }, { v: 45, t: "45" },
    { v: 60, t: "60" }, { v: 90, t: "90" }, { v: 120, t: "2 h+" }
  ];

  let which = "next";          // "this" oder "next"
  let state = { days: {}, notes: "", feeling: null };
  let saved = false;

  // ---------- Datum ----------
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  function monday(offsetWeeks) {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dow = (d.getDay() + 6) % 7;            // Mo = 0
    d.setDate(d.getDate() - dow + 7 * offsetWeeks);
    return d;
  }
  const weekStart = () => monday(which === "next" ? 1 : 0);
  function rangeText(start) {
    const end = new Date(start); end.setDate(end.getDate() + 6);
    const o = { day: "numeric", month: "short" };
    return start.toLocaleDateString("de-DE", o) + " – " + end.toLocaleDateString("de-DE", o);
  }
  function defaultWhich() {
    const dow = (new Date().getDay() + 6) % 7;   // Mo = 0 … So = 6
    return dow <= 2 ? "this" : "next";           // Mo–Mi: diese Woche, ab Do: nächste
  }

  const fmtMin = (m) => {
    const h = Math.floor(m / 60), r = m % 60;
    return h ? h + ":" + pad(r) + " h" : r + " Min.";
  };
  const total = () => DAYS.reduce((s, d) => s + (Number(state.days[d]) || 0), 0);

  // ---------- Laden ----------
  async function load() {
    const ws = iso(weekStart());
    const { data, error } = await db.from("week_availability")
      .select("days, notes, feeling").eq("user_id", me.id).eq("week_start", ws).maybeSingle();
    if (error) throw error;
    if (data) {
      state = { days: data.days || {}, notes: data.notes || "", feeling: data.feeling };
      saved = true;
      return;
    }
    saved = false;
    state = { days: {}, notes: "", feeling: null };
    // Vorschlag: letzte gespeicherte Woche, sonst aus dem Fragebogen
    const { data: last } = await db.from("week_availability")
      .select("days").eq("user_id", me.id).lt("week_start", ws)
      .order("week_start", { ascending: false }).limit(1).maybeSingle();
    if (last && last.days) { state.days = { ...last.days }; return; }
    const { data: st } = await db.from("athlete_status").select("answers").eq("user_id", me.id).maybeSingle();
    const a = st && st.answers;
    if (a && Array.isArray(a.days) && a.days.length && a.hours_week) {
      const per = a.hours_week * 60 / a.days.length;
      const pick = OPTIONS.reduce((best, o) => Math.abs(o.v - per) < Math.abs(best.v - per) ? o : best, OPTIONS[0]);
      a.days.forEach((d) => { if (DAYS.includes(d)) state.days[d] = pick.v; });
    }
  }

  // ---------- Anzeige ----------
  async function render() {
    const card = $("week-card");
    if (!card || !me) return;
    try { await load(); } catch (e) { $("week-msg").textContent = translate(e); $("week-msg").className = "msg error"; return; }

    $("week-this").setAttribute("aria-pressed", which === "this");
    $("week-next").setAttribute("aria-pressed", which === "next");
    $("week-range").textContent = rangeText(weekStart());
    $("week-badge").hidden = !saved;
    $("week-intro").textContent = saved
      ? "Eingetragen. Du kannst es jederzeit anpassen."
      : "Wie viel Zeit hast du an welchem Tag? Daraus entsteht dein Wochenplan.";

    const box = $("week-days");
    box.innerHTML = "";
    DAYS.forEach((d) => {
      const row = document.createElement("div");
      row.className = "wday";
      const lab = document.createElement("span");
      lab.className = "wday-name"; lab.textContent = d; lab.id = "wd-" + d;
      const chips = document.createElement("div");
      chips.className = "wchips"; chips.setAttribute("role", "radiogroup"); chips.setAttribute("aria-labelledby", "wd-" + d);
      OPTIONS.forEach((o) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "wchip"; b.textContent = o.t;
        b.setAttribute("aria-label", d + ": " + (o.v ? (o.v >= 120 ? "2 Stunden oder mehr" : o.v + " Minuten") : "kein Training"));
        b.setAttribute("aria-pressed", (Number(state.days[d]) || 0) === o.v);
        b.addEventListener("click", () => {
          state.days[d] = o.v;
          chips.querySelectorAll(".wchip").forEach((c, i) => c.setAttribute("aria-pressed", OPTIONS[i].v === o.v));
          updateTotal();
        });
        chips.append(b);
      });
      row.append(lab, chips);
      box.append(row);
    });
    $("week-notes").value = state.notes || "";
    document.querySelectorAll("#week-feeling .chip").forEach((c) =>
      c.setAttribute("aria-pressed", Number(c.dataset.v) === state.feeling));
    updateTotal();
    $("week-msg").textContent = "";
    $("week-save").textContent = saved ? "Änderungen speichern" : "Woche speichern";
  }

  function updateTotal() {
    const t = total();
    const n = DAYS.filter((d) => Number(state.days[d]) > 0).length;
    $("week-total").textContent = t ? fmtMin(t) + " an " + n + (n === 1 ? " Tag" : " Tagen") : "Noch keine Zeit eingetragen";
  }

  async function save() {
    const msgEl = $("week-msg");
    if (!total()) {
      msgEl.textContent = "Trag mindestens an einem Tag Zeit ein, oder schreib in die Notiz, warum diese Woche nichts geht.";
      msgEl.className = "msg error";
      if (!$("week-notes").value.trim()) return;
    }
    state.notes = $("week-notes").value.trim();
    const btn = $("week-save");
    btn.disabled = true;
    const row = { user_id: me.id, week_start: iso(weekStart()), days: state.days, notes: state.notes || null, feeling: state.feeling };
    const { error } = await db.from("week_availability").upsert(row, { onConflict: "user_id,week_start" });
    btn.disabled = false;
    if (error) { msgEl.textContent = translate(error); msgEl.className = "msg error"; return; }
    saved = true;
    $("week-badge").hidden = false;
    $("week-intro").textContent = "Eingetragen. Du kannst es jederzeit anpassen.";
    btn.textContent = "Änderungen speichern";
    msgEl.textContent = "Gespeichert ✓ Daraus erstellt Claude deinen Plan.";
    msgEl.className = "msg ok";
  }

  function bind() {
    $("week-this").addEventListener("click", () => { which = "this"; render(); });
    $("week-next").addEventListener("click", () => { which = "next"; render(); });
    $("week-save").addEventListener("click", save);
    document.querySelectorAll("#week-feeling .chip").forEach((c) => {
      c.addEventListener("click", () => {
        const v = Number(c.dataset.v);
        state.feeling = state.feeling === v ? null : v;
        document.querySelectorAll("#week-feeling .chip").forEach((x) =>
          x.setAttribute("aria-pressed", Number(x.dataset.v) === state.feeling));
      });
    });
  }

  function reset() { which = defaultWhich(); state = { days: {}, notes: "", feeling: null }; saved = false; }
  // Öffnen direkt auf „nächste Woche“ (z. B. aus der Sonntags-Benachrichtigung)
  function focusNext() { which = "next"; }

  which = defaultWhich();
  return { bind, render, reset, focusNext };
})();
