// Trainingspartner (Tabelle partnerships) und Wetter (Tabelle weather_daily).
// Bestätigte Partner sehen gegenseitig nur den Wochenplan (inkl. abgehakt), sonst nichts.

const Partner = (() => {
  let rows = [];
  let profiles = [];
  let partner = null;          // { id, name, rowId } wenn bestätigt
  let incoming = null;         // offene Anfrage an mich
  let outgoing = null;         // meine offene Anfrage
  const plans = {};            // week_start -> Plan des Partners

  const nameOf = (id) => (profiles.find((p) => p.id === id) || {}).name || "Jemand";
  const SHARED = "Ihr seht gegenseitig euren Wochenplan und was ihr abgehakt habt. Fragebogen, Saisonplan, Einschätzung, Werte, Gesundheit und Fragen an Claude bleiben privat.";
  const ALIGN = "Claude stimmt eure Pläne aufeinander ab: Schwimmen und Laufen möglichst zusammen, Rad im Sommer draußen zusammen, im Winter auf der Rolle jede:r für sich.";

  async function load(allProfiles) {
    if (allProfiles) profiles = allProfiles;
    if (!me) return;
    const { data } = await db.from("partnerships").select("id, requester, partner, status, created_at")
      .in("status", ["offen", "bestaetigt"]).order("created_at", { ascending: false });
    rows = data || [];
    const ok = rows.find((r) => r.status === "bestaetigt");
    partner = ok ? { rowId: ok.id, id: ok.requester === me.id ? ok.partner : ok.requester } : null;
    if (partner) partner.name = nameOf(partner.id);
    incoming = rows.find((r) => r.status === "offen" && r.partner === me.id) || null;
    outgoing = rows.find((r) => r.status === "offen" && r.requester === me.id) || null;
  }

  async function loadPlans(weekStarts) {
    Object.keys(plans).forEach((k) => delete plans[k]);
    if (!partner || !weekStarts.length) return;
    const { data } = await db.from("training_plans").select("week_start, sessions, done")
      .eq("user_id", partner.id).in("week_start", weekStarts);
    (data || []).forEach((p) => { plans[p.week_start] = p; });
  }

  async function answer(row, status, msgEl) {
    const { error } = await db.from("partnerships").update({ status }).eq("id", row.id);
    if (error) { if (msgEl) { msgEl.textContent = translate(error); msgEl.className = "msg error"; } return false; }
    await refresh();
    return true;
  }

  async function refresh() {
    await load();
    renderRequest(); renderCard();
    if (typeof Plan !== "undefined") Plan.render().then(() => Plan.renderToday());
  }

  // ---------- Heute: offene Anfrage ----------
  function renderRequest() {
    const box = $("partner-req");
    if (!box) return;
    box.innerHTML = "";
    if (!incoming) return;
    const who = nameOf(incoming.requester);
    const card = document.createElement("div"); card.className = "card claude-msg";
    const head = document.createElement("div"); head.className = "cm-head";
    const t = document.createElement("b"); t.textContent = who + " möchte mit dir trainieren";
    head.append(t);
    const p1 = document.createElement("p"); p1.className = "cm-body"; p1.textContent = ALIGN;
    const p2 = document.createElement("p"); p2.className = "hint"; p2.style.margin = "0 0 10px"; p2.style.fontSize = ".88rem"; p2.textContent = SHARED;
    const msg = document.createElement("div"); msg.className = "msg";
    const row = document.createElement("div"); row.className = "cm-actions"; row.style.gap = "8px";
    const no = document.createElement("button"); no.type = "button"; no.className = "secondary"; no.textContent = "Lieber nicht";
    const yes = document.createElement("button"); yes.type = "button"; yes.textContent = "Ja, gerne";
    no.addEventListener("click", async () => { no.disabled = yes.disabled = true; if (!await answer(incoming, "abgelehnt", msg)) no.disabled = yes.disabled = false; });
    yes.addEventListener("click", async () => { no.disabled = yes.disabled = true; if (!await answer(incoming, "bestaetigt", msg)) no.disabled = yes.disabled = false; });
    row.append(no, yes);
    card.append(head, p1, p2, row, msg);
    box.append(card);
  }

  // ---------- Ich: Trainingspartner ----------
  function renderCard() {
    const body = $("partner-body");
    if (!body || !me) return;
    body.innerHTML = "";
    const msg = document.createElement("div"); msg.className = "msg";
    const p = (text, cls) => { const e = document.createElement("p"); e.style.margin = "0 0 10px"; if (cls) e.className = cls; e.textContent = text; return e; };

    if (partner) {
      body.append(p("Du trainierst mit " + partner.name + ". " + ALIGN), p(SHARED, "hint"));
      const end = document.createElement("button"); end.type = "button"; end.className = "secondary"; end.textContent = "Verbindung beenden";
      end.addEventListener("click", async () => {
        if (!confirm("Verbindung mit " + partner.name + " beenden? Ihr seht dann eure Pläne nicht mehr.")) return;
        end.disabled = true;
        if (!await answer({ id: partner.rowId }, "beendet", msg)) end.disabled = false;
      });
      body.append(end, msg);
      return;
    }
    if (incoming) {
      body.append(p(nameOf(incoming.requester) + " hat dich angefragt. Antworten kannst du oben im Bereich Heute."));
      const b = document.createElement("button"); b.type = "button"; b.textContent = "Zur Anfrage"; b.dataset.goto = "heute";
      body.append(b);
      return;
    }
    if (outgoing) {
      body.append(p("Deine Anfrage an " + nameOf(outgoing.partner) + " wartet auf Bestätigung."));
      const back = document.createElement("button"); back.type = "button"; back.className = "secondary"; back.textContent = "Anfrage zurückziehen";
      back.addEventListener("click", async () => { back.disabled = true; if (!await answer(outgoing, "beendet", msg)) back.disabled = false; });
      body.append(back, msg);
      return;
    }
    body.append(p("Trainierst du oft mit jemandem zusammen? Dann stimmt Claude eure Pläne aufeinander ab. " + SHARED, "hint"));
    profiles.filter((x) => x.id !== me.id).forEach((x) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "secondary"; b.style.marginTop = "8px";
      b.textContent = "Mit " + x.name + " trainieren";
      b.addEventListener("click", async () => {
        b.disabled = true;
        const { error } = await db.from("partnerships").insert({ requester: me.id, partner: x.id });
        b.disabled = false;
        if (error) { msg.textContent = translate(error); msg.className = "msg error"; return; }
        refresh();
      });
      body.append(b);
    });
    body.append(msg);
  }

  return {
    load, loadPlans, renderRequest, renderCard, refresh,
    get: () => partner,
    planFor: (ws) => plans[ws] || null
  };
})();

// ---------- Wetter ----------
const Wetter = (() => {
  let place = null;
  const days = {};

  function icon(code) {
    if (code == null) return "";
    if (code === 0) return "☀️";
    if (code <= 2) return "🌤️";
    if (code === 3) return "☁️";
    if (code === 45 || code === 48) return "🌫️";
    if (code >= 51 && code <= 57) return "🌦️";
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "🌧️";
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "❄️";
    if (code >= 95) return "⛈️";
    return "";
  }

  async function load() {
    if (!me) return;
    const { data: pl } = await db.rpc("my_weather_place");
    place = pl || null;
    Object.keys(days).forEach((k) => delete days[k]);
    if (!place) return;
    const { data } = await db.from("weather_daily").select("day, code, tmin, tmax, precip_mm, precip_prob").eq("place", place);
    (data || []).forEach((d) => { days[d.day] = d; });
  }

  // Kurzer Text, z. B. „🌧️ 9° · 6 mm“
  function label(isoDay) {
    const d = days[isoDay];
    if (!d) return "";
    const parts = [icon(d.code) + " " + Math.round(d.tmax) + "°"];
    if (Number(d.precip_mm) >= 1 && Number(d.precip_prob) >= 40) parts.push(Math.round(d.precip_mm) + " mm");
    return parts.join(" · ");
  }

  return { load, label, place: () => place };
})();
