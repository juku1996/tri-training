// „Frag Claude“: Fragen werden in claude_requests gespeichert.
// Eine geplante Aufgabe schaut regelmäßig nach und schreibt die Antwort zurück.

const Fragen = (() => {
  const text = () => $("fragen-text");

  function fmt(iso) {
    return typeof formatWhen === "function" ? formatWhen(iso) : new Date(iso).toLocaleString("de-DE");
  }

  async function render() {
    if (!me) return;
    const { data, error } = await db.from("claude_requests")
      .select("id, question, status, answer, plan_changed, created_at, answered_at")
      .eq("user_id", me.id).order("created_at", { ascending: false }).limit(10);
    const list = $("fragen-list");
    list.innerHTML = "";
    if (error) { $("fragen-msg").textContent = translate(error); $("fragen-msg").className = "msg error"; return; }
    (data || []).forEach((r) => {
      const li = document.createElement("li");
      const head = document.createElement("div"); head.className = "head";
      const who = document.createElement("span"); who.className = "who"; who.textContent = "Du";
      const when = document.createElement("span"); when.className = "when"; when.textContent = fmt(r.created_at);
      const st = document.createElement("span");
      st.className = "status-pill" + (r.status === "beantwortet" ? " ok" : "");
      st.textContent = r.status === "beantwortet" ? "Beantwortet" : "Wartet auf Claude";
      head.append(who, when, st);
      const q = document.createElement("div"); q.className = "body"; q.textContent = r.question;
      li.append(head, q);
      if (r.answer) {
        const a = document.createElement("div"); a.className = "answer";
        const by = document.createElement("div"); by.className = "answer-by";
        by.textContent = "Claude" + (r.plan_changed ? " · Plan angepasst" : "");
        a.append(by, document.createTextNode(r.answer));
        li.append(a);
        if (r.plan_changed) {
          const b = document.createElement("button");
          b.type = "button"; b.className = "ghost"; b.style.paddingLeft = "0"; b.textContent = "Zum Plan ›";
          b.dataset.goto = "plan"; b.dataset.scroll = "plan-card";
          li.append(b);
        }
      }
      list.append(li);
    });
  }

  async function send(e) {
    e.preventDefault();
    const q = text().value.trim();
    const m = $("fragen-msg");
    if (!q || !me) return;
    if (q.includes("…")) {
      m.textContent = "Bitte ersetze noch die Platzhalter „…“ durch deine Angaben.";
      m.className = "msg error";
      return;
    }
    const btn = $("fragen-send");
    btn.disabled = true;
    const { error } = await db.from("claude_requests").insert({ user_id: me.id, question: q });
    btn.disabled = false;
    if (error) { m.textContent = translate(error); m.className = "msg error"; return; }
    text().value = "";
    $("fragen-count").textContent = "";
    m.textContent = "Gesendet ✓ Du bekommst eine Benachrichtigung, sobald Claude geantwortet hat.";
    m.className = "msg ok";
    render();
  }

  function bind() {
    $("fragen-form").addEventListener("submit", send);
    text().addEventListener("input", () => {
      const n = text().value.length;
      $("fragen-count").textContent = n > 1200 ? (1500 - n) + " Zeichen übrig" : "";
    });
    document.querySelectorAll("#fragen-chips .chip").forEach((c) => {
      c.addEventListener("click", () => {
        text().value = c.dataset.text;
        text().focus();
        const i = text().value.indexOf("…");
        if (i >= 0) text().setSelectionRange(i, i + 1);
      });
    });
    // Beim Zurückholen der App neue Antworten laden
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && me) render();
    });
  }

  return { bind, render };
})();
