// Einheit auf einen anderen Tag verschieben (diese oder nächste Woche, ab heute).
// Speichert über die Datenbank-Funktion move_session; gemeinsame Einheiten können beim Partner mitverschoben werden.

const Move = (() => {
  const COLORS = { swim: "var(--swim)", bike: "var(--bike)", run: "var(--run)", strength: "#8b6fd6", other: "var(--muted)" };
  let el = null;

  function build() {
    el = document.createElement("div");
    el.className = "sheet-backdrop"; el.id = "move-sheet"; el.hidden = true;
    el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "move-title");
    el.innerHTML = '<div class="sheet"><h2 id="move-title">Einheit verschieben</h2><p id="move-sub"></p>' +
      '<div id="move-days"></div><label class="move-partner" id="move-partner" hidden><input type="checkbox" id="move-with" checked> <span></span></label>' +
      '<div class="msg" id="move-msg" role="status"></div>' +
      '<button type="button" id="move-save" disabled>Verschieben</button>' +
      '<button type="button" class="ghost later" id="move-cancel">Abbrechen</button></div>';
    document.body.append(el);
    el.addEventListener("click", (e) => { if (e.target === el) close(); });
    el.querySelector("#move-cancel").addEventListener("click", close);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el.hidden) close(); });
  }

  function close() { if (el) el.hidden = true; }

  function open(plan, s) {
    if (!el) build();
    const P = Plan;
    const today = P.parse(P.iso(new Date()));
    const cur = P.dayDate(plan.week_start, s.day);
    const fmt = (d, o) => d.toLocaleDateString("de-DE", o);
    el.querySelector("#move-sub").textContent = s.title + " · geplant für " + fmt(cur, { weekday: "long", day: "numeric", month: "numeric" }) + " – auf welchen Tag?";
    const msg = el.querySelector("#move-msg"); msg.textContent = ""; msg.className = "msg";
    const save = el.querySelector("#move-save"); save.disabled = true; save.textContent = "Verschieben";
    const box = el.querySelector("#move-days"); box.innerHTML = "";
    let pick = null;

    // Wochen: die Woche der Einheit und die folgende (falls es dafür schon einen Plan gibt)
    const next = P.parse(plan.week_start); next.setDate(next.getDate() + 7);
    const weeks = P.weeks().filter((w) => w.week_start === plan.week_start || w.week_start === P.iso(next));
    weeks.forEach((w) => {
      const h = document.createElement("div"); h.className = "move-week";
      const ws = P.parse(w.week_start), we = P.parse(w.week_start); we.setDate(we.getDate() + 6);
      h.textContent = (ws <= today && today <= we ? "Diese Woche" : "Woche ab " + fmt(ws, { day: "numeric", month: "numeric" }));
      const grid = document.createElement("div"); grid.className = "move-grid";
      P.DAYS.forEach((day) => {
        const d = P.dayDate(w.week_start, day);
        const b = document.createElement("button"); b.type = "button"; b.className = "move-day";
        const same = w.week_start === plan.week_start && day === s.day;
        b.disabled = same || d < today;
        const t = document.createElement("b"); t.textContent = day;
        const n = document.createElement("span"); n.textContent = d.getDate() + ".";
        const dots = document.createElement("span"); dots.className = "move-dots";
        (w.sessions || []).filter((x) => x.day === day && x.id !== s.id).forEach((x) => {
          const dot = document.createElement("i"); dot.style.background = COLORS[x.sport] || COLORS.other; dots.append(dot);
        });
        const wl = typeof Wetter !== "undefined" ? Wetter.label(P.iso(d)) : "";
        const wx = document.createElement("span"); wx.className = "move-wx"; wx.textContent = wl ? wl.split(" ")[0] : "";
        b.append(t, n, dots, wx);
        b.setAttribute("aria-label", fmt(d, { weekday: "long", day: "numeric", month: "long" }) + (dots.children.length ? ", schon " + dots.children.length + " Einheit(en)" : "") + (same ? ", aktueller Tag" : ""));
        b.setAttribute("aria-pressed", "false");
        b.addEventListener("click", () => {
          box.querySelectorAll(".move-day").forEach((x) => x.setAttribute("aria-pressed", "false"));
          b.setAttribute("aria-pressed", "true");
          pick = { week: w.week_start, day, date: d };
          save.disabled = false;
          save.textContent = "Auf " + fmt(d, { weekday: "long" }) + ", " + d.getDate() + "." + (d.getMonth() + 1) + ". verschieben";
          msg.textContent = dots.children.length ? "An dem Tag steht schon etwas an – das ist okay, wenn es zeitlich passt." : "";
          msg.className = "msg";
        });
        grid.append(b);
      });
      box.append(h, grid);
    });

    const partner = typeof Partner !== "undefined" ? Partner.get() : null;
    const pl = el.querySelector("#move-partner");
    pl.hidden = !(s.together && partner);
    if (!pl.hidden) { pl.querySelector("span").textContent = "Auch bei " + partner.name + " verschieben (gemeinsame Einheit)"; pl.querySelector("input").checked = true; }

    save.onclick = async () => {
      if (!pick) return;
      save.disabled = true;
      const withP = !pl.hidden && pl.querySelector("input").checked;
      const { data, error } = await db.rpc("move_session", { p_week: plan.week_start, p_id: s.id, p_to_week: pick.week, p_to_day: pick.day, p_with_partner: withP });
      if (error) { msg.textContent = translate(error); msg.className = "msg error"; save.disabled = false; return; }
      close();
      await Plan.render();
      Plan.renderToday();
      if (data && withP && !data.partner && partner) alert("Bei dir ist die Einheit verschoben. Bei " + partner.name + " war keine passende offene Einheit am selben Tag – sie bleibt, wo sie ist.");
    };

    el.hidden = false;
  }

  return { open };
})();
