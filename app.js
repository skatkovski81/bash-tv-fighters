(() => {
  // ====== SET THESE URLs ======
  const CURRENT_SHEET_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS-yUyMl6_JKF5v88KQniCPdzHfg26pZmFE7jbnIKsScNmqlpYYJVJWfkWNBmOFOolKwhMZSwfHVU0W/pub?gid=0&single=true&output=csv";
  const ALUMNI_SHEET_CSV_URL = ""; // optional

  const $ = (sel) => document.querySelector(sel);

  const els = {
    grid: $("#bash-grid"),
    status: $("#bash-status"),
    search: $("#bash-search"),
    sport: $("#bash-sport"),
    weight: $("#bash-weight"),
    tabCurrent: $("#bash-tab-current"),
    tabAlumni: $("#bash-tab-alumni"),
    modal: $("#bash-modal"),
    modalBody: $("#bash-modal-body"),
  };

  if (!els.grid) return;

  const setStatus = (msg) => {
    els.status.innerHTML = msg ? `<div class="bash-help">${msg}</div>` : "";
  };

  function escapeHtml(s){
    return (s || "").replace(/[&<>"']/g, m => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }

  // CSV parser (supports quoted commas/newlines)
  function csvToRows(text){
    const rows = [];
    let row = [], cur = "", inQ = false;

    for (let i = 0; i < text.length; i++){
      const ch = text[i];
      const next = text[i+1];

      if (ch === '"' && inQ && next === '"'){ cur += '"'; i++; continue; }
      if (ch === '"'){ inQ = !inQ; continue; }

      if (!inQ && ch === ","){ row.push(cur); cur = ""; continue; }
      if (!inQ && (ch === "\n" || ch === "\r")){
        if (ch === "\r" && next === "\n") i++;
        row.push(cur); rows.push(row);
        row = []; cur = "";
        continue;
      }
      cur += ch;
    }
    row.push(cur);
    rows.push(row);
    return rows.filter(r => r.some(c => (c || "").trim() !== ""));
  }

  function parseVideoUrls(s){
    if(!s) return [];
    return s.split(/[\n,]/g).map(x => x.trim()).filter(Boolean);
  }

  async function fetchTextWithFallback(url){
    try{
      const r1 = await fetch(url, { cache:"no-store" });
      if (r1.ok) return await r1.text();
    }catch(e){}

    const proxied = "https://corsproxy.io/?" + encodeURIComponent(url);
    const r2 = await fetch(proxied, { cache:"no-store" });
    if(!r2.ok) throw new Error("Failed to fetch CSV (direct + proxy).");
    return await r2.text();
  }

  function normalizeWeightKey(label){
    return (label || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g,"")
      .replace(/[^a-z]/g,"");
  }

  async function loadSheet(csvUrl, forcedStatus){
    if(!csvUrl) return [];
    const text = await fetchTextWithFallback(csvUrl);
    const rows = csvToRows(text);
    if (rows.length < 2) return [];

    const headers = rows[0].map(h => (h || "").trim());
    const idx = (h) => headers.indexOf(h);

    if (idx("name") === -1){
      console.warn("Sheet headers found:", headers);
      throw new Error("Sheet headers must include at least: name");
    }

    return rows.slice(1).map(r => {
      const rawWeight = (r[idx("weight")] || "").trim();
      return {
        id: (r[idx("id")] || "").trim() || (crypto?.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)),
        status: (forcedStatus || (r[idx("status")] || "").trim().toLowerCase() || "current"),
        name: (r[idx("name")] || "").trim(),
        photo: (r[idx("photo")] || "").trim(),
        record: (r[idx("record")] || "").trim(),
        sport: ((r[idx("sport")] || "boxing").trim()).toLowerCase(),

        // ✅ display exactly as typed + key for filtering
        weightLabel: rawWeight,
        weightKey: normalizeWeightKey(rawWeight),

        country: (r[idx("country")] || "").trim(),
        age: (r[idx("age")] || "").trim(),
        igHandle: (r[idx("igHandle")] || "").trim(),
        boxrec: (r[idx("boxrec")] || "").trim(),
        tagline: (r[idx("tagline")] || "").trim(),
        bio: (r[idx("bio")] || "").trim(),
        replayUrls: parseVideoUrls((r[idx("replays")] || "").trim()),
        boutUrls: parseVideoUrls((r[idx("bouts")] || "").trim()),
        featuredEmbed: (r[idx("featuredEmbed")] || "").trim(),
      };
    }).filter(f => f.name);
  }

  let allFighters = [];
  let activeTab = "current";

  function getFilters(){
    return {
      q: (els.search.value || "").trim().toLowerCase(),
      sport: (els.sport.value || "all"),
      weight: (els.weight.value || "all"),
    };
  }

  function matches(f, {q, sport, weight}){
    if (sport !== "all" && f.sport !== sport) return false;
    if (weight !== "all" && f.weightKey !== weight) return false;
    if (!q) return true;
    const hay = `${f.name} ${f.record} ${f.country} ${f.weightLabel} ${f.sport}`.toLowerCase();
    return hay.includes(q);
  }

  // Embeds
  function normalizeUrl(u){ try { return (u||"").trim(); } catch(e){ return ""; } }

  function getEmbedHtmlFromUrl(url){
    const u = normalizeUrl(url);
    if (!u) return "";

    const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{6,})/);
    if (yt && yt[1]) {
      return `<iframe src="https://www.youtube.com/embed/${yt[1]}" title="YouTube video" loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen></iframe>`;
    }

    const vm = u.match(/vimeo\.com\/(\d+)/);
    if (vm && vm[1]) {
      return `<iframe src="https://player.vimeo.com/video/${vm[1]}" title="Vimeo video" loading="lazy"
        allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
    }

    if (u.includes("youtube.com/embed/") || u.includes("player.vimeo.com/video/")) {
      return `<iframe src="${escapeHtml(u)}" title="Video" loading="lazy"
        allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
    }

    return "";
  }

  function sanitizeEmbedHtml(html){
    const s = (html || "").trim();
    if (!s) return "";
    if (s.toLowerCase().includes("<iframe")) return s;

    const maybe = getEmbedHtmlFromUrl(s);
    if (maybe) return maybe;

    return `<div class="bash-embed-fallback"><a href="${escapeHtml(s)}" target="_blank" rel="noopener">Open</a></div>`;
  }

  function renderEmbedCard(url, label){
    const u = normalizeUrl(url);
    if (!u) return "";
    const iframe = getEmbedHtmlFromUrl(u);

    if (iframe) {
      return `<article class="bash-embed-card">
        <div class="bash-embed-title">${escapeHtml(label)}</div>
        <div class="bash-embed">${iframe}</div>
      </article>`;
    }

    return `<article class="bash-embed-card">
      <div class="bash-embed-title">${escapeHtml(label)}</div>
      <div class="bash-embed-fallback"><a href="${escapeHtml(u)}" target="_blank" rel="noopener">Open video</a></div>
    </article>`;
  }

  function render(){
    const filters = getFilters();
    const list = allFighters
      .filter(f => (activeTab === "current" ? f.status !== "alumni" : f.status === "alumni"))
      .filter(f => matches(f, filters));

    els.grid.innerHTML = list.map(f => `
      <article class="bash-card" data-id="${f.id}">
        <img class="bash-photo" src="${f.photo || ""}" alt="${escapeHtml(f.name || "Fighter")}" loading="lazy" />
        <div class="bash-card-body">
          <h3 class="bash-name">${escapeHtml(f.name)}</h3>
          <p class="bash-meta">
            ${f.record ? `<span class="bash-pill">${escapeHtml(f.record)}</span>` : ""}
            ${f.sport ? `<span class="bash-pill">${escapeHtml(f.sport.toUpperCase())}</span>` : ""}
            ${f.weightLabel ? `<span class="bash-pill">${escapeHtml(f.weightLabel)}</span>` : ""}
            ${f.country ? `<span class="bash-pill">${escapeHtml(f.country)}</span>` : ""}
          </p>
        </div>
      </article>
    `).join("") || `<div class="bash-help">No fighters found for these filters.</div>`;
  }

  function openModal(f){
    const tabs = [];

    const profileHtml = `
      <div class="bash-modal-top">
        <img class="bash-modal-photo" src="${f.photo || ""}" alt="${escapeHtml(f.name)}" />
        <div>
          <h2 class="bash-h2">${escapeHtml(f.name)}</h2>
          <p class="bash-small">
            ${f.record ? `${escapeHtml(f.record)} • ` : ""}
            ${f.sport ? `${escapeHtml(f.sport.toUpperCase())} • ` : ""}
            ${f.weightLabel ? `${escapeHtml(f.weightLabel)}` : ""}
          </p>
          <p class="bash-small">
            ${f.country ? `${escapeHtml(f.country)}` : ""}
            ${f.age ? `${f.country ? " • " : ""}Age ${escapeHtml(f.age)}` : ""}
          </p>

          ${f.tagline ? `<p class="bash-small">${escapeHtml(f.tagline)}</p>` : ""}
          ${f.bio ? `<p class="bash-small">${escapeHtml(f.bio)}</p>` : ""}

          ${(f.boxrec || f.igHandle) ? `
            <div class="bash-links">
              ${f.boxrec ? `<p><a href="${f.boxrec}" target="_blank" rel="noopener">BoxRec</a></p>` : ""}
              ${f.igHandle ? `<p><a href="https://instagram.com/${f.igHandle.replace(/^@/,"")}" target="_blank" rel="noopener">Instagram ${escapeHtml(f.igHandle)}</a></p>` : ""}
            </div>
          ` : ""}
        </div>
      </div>
    `;
    tabs.push({ id:"profile", label:"Profile", html: profileHtml });

    if (f.featuredEmbed && f.featuredEmbed.trim()){
      tabs.push({ id:"featured", label:"Featured", html: `
        <div class="bash-panel"><div class="bash-embed-wrap">${sanitizeEmbedHtml(f.featuredEmbed)}</div></div>
      `});
    }

    if (f.replayUrls?.length){
      tabs.push({ id:"replays", label:`Replays (${f.replayUrls.length})`, html: `
        <div class="bash-panel"><div class="bash-embed-grid">
          ${f.replayUrls.map((u,i)=>renderEmbedCard(u, `Replay ${i+1}`)).join("")}
        </div></div>
      `});
    }

    if (f.boutUrls?.length){
      tabs.push({ id:"bouts", label:`Bouts (${f.boutUrls.length})`, html: `
        <div class="bash-panel"><div class="bash-embed-grid">
          ${f.boutUrls.map((u,i)=>renderEmbedCard(u, `Bout ${i+1}`)).join("")}
        </div></div>
      `});
    }

    const tabButtons = tabs.map((t, idx) => `
      <button class="bash-modal-tab ${idx===0 ? "is-active":""}" type="button"
        data-tab="${t.id}" aria-selected="${idx===0 ? "true":"false"}" role="tab">
        ${escapeHtml(t.label)}
      </button>
    `).join("");

    const tabPanels = tabs.map((t, idx) => `
      <section class="bash-modal-panel ${idx===0 ? "is-active":""}" data-panel="${t.id}" role="tabpanel">
        ${t.html}
      </section>
    `).join("");

    els.modalBody.innerHTML = `<div class="bash-modal-tabs" role="tablist">${tabButtons}</div>${tabPanels}`;

    els.modalBody.querySelector(".bash-modal-tabs").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tab]");
      if(!btn) return;
      const id = btn.getAttribute("data-tab");

      els.modalBody.querySelectorAll(".bash-modal-tab").forEach(b => {
        const on = b.getAttribute("data-tab") === id;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", on ? "true":"false");
      });

      els.modalBody.querySelectorAll(".bash-modal-panel").forEach(p => {
        p.classList.toggle("is-active", p.getAttribute("data-panel") === id);
      });
    });

    document.body.classList.add("bash-lock");
    els.modal.classList.add("is-open");
    els.modal.setAttribute("aria-hidden","false");
  }

  function closeModal(){
    els.modal.classList.remove("is-open");
    els.modal.setAttribute("aria-hidden","true");
    document.body.classList.remove("bash-lock");
    els.modalBody.innerHTML = "";
  }

  // Events
  els.grid.addEventListener("click", (e) => {
    const card = e.target.closest(".bash-card");
    if(!card) return;
    const f = allFighters.find(x => x.id === card.getAttribute("data-id"));
    if(f) openModal(f);
  });

  els.modal.addEventListener("click", (e) => {
    if (e.target?.dataset?.close) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && els.modal.classList.contains("is-open")) closeModal();
  });

  [els.search, els.sport, els.weight].forEach(el => {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  els.tabCurrent.addEventListener("click", () => {
    activeTab = "current";
    els.tabCurrent.classList.add("is-active");
    els.tabAlumni.classList.remove("is-active");
    render();
  });

  els.tabAlumni.addEventListener("click", () => {
    activeTab = "alumni";
    els.tabAlumni.classList.add("is-active");
    els.tabCurrent.classList.remove("is-active");
    render();
  });

  (async function init(){
    try{
      setStatus("Loading fighters…");
      const current = await loadSheet(CURRENT_SHEET_CSV_URL, "current");
      const alumni  = ALUMNI_SHEET_CSV_URL ? await loadSheet(ALUMNI_SHEET_CSV_URL, "alumni") : [];
      allFighters = [...current, ...alumni];
      setStatus("");
      render();
    }catch(err){
      console.error(err);
      setStatus("Could not load fighters from Google Sheet. Make sure the CSV URL is published + public.");
      els.grid.innerHTML = "";
    }
  })();
})();
