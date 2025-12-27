(() => {
  // ====== SET THESE URLs ======
  // Published CSV endpoints (public). Paste your links here.
  const CURRENT_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS-yUyMl6_JKF5v88KQniCPdzHfg26pZmFE7jbnIKsScNmqlpYYJVJWfkWNBmOFOolKwhMZSwfHVU0W/pub?gid=0&single=true&output=csv";
  const ALUMNI_SHEET_CSV_URL  = ""; // optional (leave "" if you don't have alumni)

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
    // Direct first
    try{
      const r1 = await fetch(url, { cache:"no-store" });
      if (r1.ok) return await r1.text();
    }catch(e){}

    // Proxy fallback (helps if a network blocks direct Google fetch)
    const proxied = "https://corsproxy.io/?" + encodeURIComponent(url);
    const r2 = await fetch(proxied, { cache:"no-store" });
    if(!r2.ok) throw new Error("Failed to fetch CSV (direct + proxy).");
    return await r2.text();
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
      throw new Error("Sheet headers must include at least: name (recommended: photo, record, sport, weight, country, bio, replays, bouts, featuredEmbed).");
    }

    return rows.slice(1).map(r => {
      const normWeight = ((r[idx("weight")] || "").trim()).toLowerCase().replace(/\s+/g,"");
      const normSport  = ((r[idx("sport")] || "boxing").trim()).toLowerCase();

      return {
        id: (r[idx("id")] || "").trim() || (crypto?.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)),
        status: (forcedStatus || (r[idx("status")] || "").trim().toLowerCase() || "current"),
        name: (r[idx("name")] || "").trim(),
        photo: (r[idx("photo")] || "").trim(),
        record: (r[idx("record")] || "").trim(),
        sport: normSport,
        weight: normWeight,
        country: (r[idx("country")] || "").trim(),
        age: (r[idx("age")] || "").trim(),
        igHandle: (r[idx("igHandle")] || "").trim(),
        igFollowing: (r[idx("igFollowing")] || "").trim(),
        boxrec: (r[idx("boxrec")] || "").trim(),
        tagline: (r[idx("tagline")] || "").trim(),
        bio: (r[idx("bio")] || "").trim(),
        replayUrls: parseVideoUrls((r[idx("replays")] || "").trim()),
        boutUrls: parseVideoUrls((r[idx("bouts")] || "").trim()),
        featuredEmbed: (r[idx("featuredEmbed")] || "").trim(),
      };
    }).filter(f => f.name);
  }

  // ===== State =====
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
    if (weight !== "all" && f.weight !== weight) return false;
    if (!q) return true;
    const hay = `${f.name} ${f.record} ${f.country} ${f.weight} ${f.sport}`.toLowerCase();
    return hay.includes(q);
  }

  function prettyWeight(w){
    if(!w) return "";
    // Turn "superfeatherweight" -> "super featherweight"
    return w.replace(/(super|light|middle|heavy|cruiser)(?=[a-z])/g, "$1 ")
            .replace(/\s+/g," ")
            .trim();
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
            ${f.weight ? `<span class="bash-pill">${escapeHtml(prettyWeight(f.weight))}</span>` : ""}
            ${f.country ? `<span class="bash-pill">${escapeHtml(f.country)}</span>` : ""}
          </p>
        </div>
      </article>
    `).join("") || `<div class="bash-help">No fighters found for these filters.</div>`;
  }

  function openModal(f){
    els.modalBody.innerHTML = `
      <div class="bash-modal-top">
        <img class="bash-modal-photo" src="${f.photo || ""}" alt="${escapeHtml(f.name)}" />
        <div>
          <h2 class="bash-h2">${escapeHtml(f.name)}</h2>
          <p class="bash-small">
            ${f.record ? `${escapeHtml(f.record)} • ` : ""}
            ${f.sport ? `${escapeHtml(f.sport.toUpperCase())} • ` : ""}
            ${f.weight ? `${escapeHtml(prettyWeight(f.weight))}` : ""}
          </p>

          ${f.tagline ? `<p class="bash-small">${escapeHtml(f.tagline)}</p>` : ""}
          ${f.bio ? `<p class="bash-small">${escapeHtml(f.bio)}</p>` : ""}

          <div class="bash-links">
            ${f.boxrec ? `<p><a href="${f.boxrec}" target="_blank" rel="noopener">BoxRec</a></p>` : ""}
            ${f.igHandle ? `<p><a href="https://instagram.com/${f.igHandle.replace(/^@/,"")}" target="_blank" rel="noopener">Instagram ${escapeHtml(f.igHandle)}</a></p>` : ""}
          </div>
        </div>
      </div>
    `;
    els.modal.classList.add("is-open");
    els.modal.setAttribute("aria-hidden","false");
  }

  function closeModal(){
    els.modal.classList.remove("is-open");
    els.modal.setAttribute("aria-hidden","true");
  }

  // ===== Events =====
  els.grid.addEventListener("click", (e) => {
    const card = e.target.closest(".bash-card");
    if(!card) return;
    const id = card.getAttribute("data-id");
    const f = allFighters.find(x => x.id === id);
    if(f) openModal(f);
  });

  els.modal.addEventListener("click", (e) => {
    if (e.target?.dataset?.close) closeModal();
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

  // ===== Init =====
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
      setStatus("Could not load fighters from Google Sheet. Make sure your CSV is public + published, and your CSV URL is correct.");
      els.grid.innerHTML = "";
    }
  })();
})();
