const STORAGE_KEY = "anking_v10_stats";
const DECK_TIME_KEY = "anking_v10_deck_time";
const TOTAL_TIME_KEY = "anking_v10_total_time";
const GOAL_KEY = "anking_v10_daily_goal";
const REVIEW_LOG_KEY = "anking_v10_review_log";
const PAGE_SIZE = 30;
const PASTAS_MEDIA = ["media/", ...Array.from({ length: 24 }, (_, i) => `media/media_${i + 1}/`)];
const MEDIA_PATH_CACHE = new Map();
const state = { cards: [], selectedDeck: "", studyQueue: [], studyIndex: 0, revealed: false, searchPage: 1, sessionSeconds: 0, sessionDeck: "", timerHandle: null, deckTime: {}, totalTime: 0, dailyGoal: 50, reviewLog: {}, isAnswering: false, searchQuery: "" };
const el = (id) => document.getElementById(id);

function defaultCardStats() { return { reviewed: 0, correct: 0, wrong: 0, activeWrong: false, lastReviewedDate: "", srs: { state: "new", dueAt: 0, intervalDays: 0, ease: 2.5, reps: 0, lapses: 0 } }; }
function loadJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } }
function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function nowTs() { return Date.now(); }
function todayKey(ts = Date.now()) { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function formatSeconds(sec) { sec = Math.max(0, Number(sec || 0)); const h = String(Math.floor(sec / 3600)).padStart(2, "0"); const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0"); const s = String(sec % 60).padStart(2, "0"); return `${h}:${m}:${s}`; }
function formatDateShort(ts) { return ts ? new Date(ts).toLocaleString("pt-BR") : "-"; }
function queueName(card) { return card.stats?.srs?.state || "new"; }
function nomeFila(card) { const e = queueName(card); return e === "new" ? "novo" : e === "learning" ? "aprendendo" : e === "review" ? "revisão" : e; }
function isDue(card) { return (card.stats?.srs?.dueAt || 0) <= nowTs(); }
function reviewedToday(card) { return card.stats?.lastReviewedDate === todayKey(); }
function hasWrong(card) { return !!card.stats?.activeWrong; }
function hasCorrect(card) { return (card.stats?.correct || 0) > 0; }
function escapeHtml(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function escapeHtmlAttr(value) { return escapeHtml(value); }
function shortDeckName(deck) {
  const parts = String(deck || '').split('::').map(v => v.trim()).filter(Boolean);
  if (!parts.length) return deck || 'Sem deck';
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  const prev = parts[parts.length - 2];
  if (last.length <= 3 && parts.length >= 3) return `${parts[parts.length - 3]} • ${prev}`;
  return `${prev} • ${last}`;
}
function normalizeMediaName(src) { return String(src || '').split('/').pop() || ''; }
function mediaCandidates(name) { const safe = encodeURIComponent(name).replace(/%2F/g, '/'); return PASTAS_MEDIA.map(base => base + safe); }
function resolveMediaPath(name, onSuccess, onFailure) {
  const normalized = normalizeMediaName(name);
  if (!normalized) { onFailure?.(); return; }
  if (MEDIA_PATH_CACHE.has(normalized)) { onSuccess(MEDIA_PATH_CACHE.get(normalized)); return; }
  const candidates = mediaCandidates(normalized);
  let idx = 0;
  const probe = document.createElement('img');
  probe.decoding = 'async';
  probe.onload = () => { MEDIA_PATH_CACHE.set(normalized, candidates[idx]); onSuccess(candidates[idx]); };
  probe.onerror = () => { idx += 1; if (idx < candidates.length) probe.src = candidates[idx]; else onFailure?.(); };
  probe.src = candidates[idx];
}

async function boot() {
  setLoading(10, "Lendo cartões...");
  const baseParts = await Promise.all([
    fetch(`cards_part1.json?v=${APP_VERSION}`, { cache: "no-store" }).then(r => r.json()),
    fetch(`cards_part2.json?v=${APP_VERSION}`, { cache: "no-store" }).then(r => r.json()),
    fetch(`cards_part3.json?v=${APP_VERSION}`, { cache: "no-store" }).then(r => r.json()),
    fetch(`cards_part4.json?v=${APP_VERSION}`, { cache: "no-store" }).then(r => r.json())
  ]);
  const savedStats = loadJson(STORAGE_KEY, {});
  state.deckTime = loadJson(DECK_TIME_KEY, {});
  state.totalTime = Number(localStorage.getItem(TOTAL_TIME_KEY) || 0);
  state.dailyGoal = Number(localStorage.getItem(GOAL_KEY) || 50);
  state.reviewLog = loadJson(REVIEW_LOG_KEY, {});
  state.cards = baseParts.flat().map(card => ({
    ...card,
    stats: savedStats[card.id] || defaultCardStats(),
    shortDeck: shortDeckName(card.deck),
    searchText: `${card.front || ""} ${card.back || ""} ${card.deck || ""} ${card.title || ""}`.toLowerCase()
  }));
  bindEvents();
  renderAll();
  if ("serviceWorker" in navigator) { window.addEventListener("load", async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        const currentUrl = reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || "";
        if (currentUrl && !currentUrl.includes(`service-worker.js?v=${APP_VERSION}`)) await reg.unregister();
      }
      await navigator.serviceWorker.register(`./service-worker.js?v=${APP_VERSION}`);
    } catch {}
  }); }
  setLoading(100, "Concluído");
  setTimeout(() => { el("loadingScreen").classList.add("hidden"); el("app").classList.remove("hidden"); }, 250);
}

function setLoading(percent, text) { el("loadingBar").style.width = percent + "%"; el("loadingText").textContent = text; }
function bindEvents() {
  document.querySelectorAll(".nav-btn").forEach(btn => btn.addEventListener("click", () => switchView(btn.dataset.view)));
  el("clearDeckBtn").addEventListener("click", () => { state.selectedDeck = ""; renderAll(); });
  el("resetStatsBtn").addEventListener("click", resetAll);
  el("dashboardDeckSearch").addEventListener("input", renderDashboard);
  el("subjectFilterInput").addEventListener("input", renderSubjects);
  el("cardSearchInput").addEventListener("input", () => { state.searchPage = 1; state.searchQuery = (el("cardSearchInput").value || "").trim().toLowerCase(); renderSearch(); });
  el("searchDeckSelect").addEventListener("change", () => { state.searchPage = 1; renderSearch(); });
  el("searchQueueSelect").addEventListener("change", () => { state.searchPage = 1; renderSearch(); });
  el("studyDeckSelect").addEventListener("change", () => { state.selectedDeck = el("studyDeckSelect").value || ""; renderAll(); switchView("study"); });
  el("studyModeSelect").addEventListener("change", renderStudyInfo);
  el("studyOrderSelect").addEventListener("change", renderStudyInfo);
  el("studyCountInput").addEventListener("input", renderStudyInfo);
  el("startStudyBtn").addEventListener("click", startStudy);
  el("endSessionBtn").addEventListener("click", () => endSession(true));
  const actionMap = { showAnswerBtn: () => { state.revealed = true; renderStudyCard(); }, againBtn: () => answerCard("again"), hardBtn: () => answerCard("hard"), goodBtn: () => answerCard("good"), easyBtn: () => answerCard("easy") };
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button[id]");
    if (!button) return;
    const action = actionMap[button.id];
    if (action) action();
  });
  document.addEventListener("keydown", (event) => {
    const studyVisible = !el("studyView").classList.contains("hidden");
    const hasQueue = state.studyQueue.length > 0 && state.studyIndex < state.studyQueue.length;
    if (!studyVisible || !hasQueue) return;
    if (event.target && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (event.code === "Space") {
      event.preventDefault();
      if (!state.revealed) { state.revealed = true; renderStudyCard(); }
    }
    if (!state.revealed) return;
    const key = event.key.toLowerCase();
    if (key === "1") answerCard("again");
    if (key === "2") answerCard("hard");
    if (key === "3") answerCard("good");
    if (key === "4") answerCard("easy");
  });
  el("dailyGoalInput").value = String(state.dailyGoal);
  el("saveGoalBtn").addEventListener("click", () => { state.dailyGoal = Math.max(1, Number(el("dailyGoalInput").value || 50)); localStorage.setItem(GOAL_KEY, String(state.dailyGoal)); renderDashboard(); });
}

function saveStats() {
  const payload = {}; state.cards.forEach(card => payload[card.id] = card.stats);
  saveJson(STORAGE_KEY, payload); saveJson(DECK_TIME_KEY, state.deckTime); localStorage.setItem(TOTAL_TIME_KEY, String(state.totalTime)); saveJson(REVIEW_LOG_KEY, state.reviewLog);
}
function switchView(viewName) { document.querySelectorAll(".view").forEach(v => v.classList.add("hidden")); el(viewName + "View").classList.remove("hidden"); document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.view === viewName)); if (viewName === "search") renderSearch(); if (viewName === "stats") renderStats(); if (viewName === "subjects") renderSubjects(); }
function getDecks() { return [...new Set(state.cards.map(c => c.deck))].sort((a, b) => a.localeCompare(b)); }
function filteredCards() { return state.selectedDeck ? state.cards.filter(c => c.deck === state.selectedDeck) : state.cards; }
function computeTotals(cards) { let reviewed = 0, correct = 0, wrong = 0; cards.forEach(c => { reviewed += c.stats.reviewed || 0; correct += c.stats.correct || 0; wrong += c.stats.wrong || 0; }); return { reviewed, correct, wrong }; }
function countQueues(cards) { const q = { new: 0, learning: 0, review: 0, due: 0 }; cards.forEach(card => { const s = queueName(card); if (q[s] !== undefined) q[s] += 1; if (isDue(card)) q.due += 1; }); return q; }
function addReviewLog() { const key = todayKey(); state.reviewLog[key] = (state.reviewLog[key] || 0) + 1; }

function renderAll() {
  renderDeckTree(); renderDeckSelects(); renderDashboard(); renderSubjects(); renderSearch(); renderStats(); renderStudyInfo();
  el("currentDeckName").textContent = state.selectedDeck ? shortDeckName(state.selectedDeck) : "Todos os decks";
  el("aboutCardCount").textContent = state.cards.length.toLocaleString("pt-BR");
  el("aboutDeckCount").textContent = getDecks().length.toLocaleString("pt-BR");
}
function renderDeckTree() {
  const root = {}; getDecks().forEach(deck => { let node = root; deck.split("::").forEach(part => { if (!node[part]) node[part] = {}; node = node[part]; }); });
  function tree(node, path = "") { let html = "<ul>"; Object.keys(node).sort((a,b)=>a.localeCompare(b)).forEach(k => { const np = path ? path + "::" + k : k; html += `<li><button class="deck-link" data-deck="${escapeHtmlAttr(np)}">${escapeHtml(k)}</button>${Object.keys(node[k]).length ? tree(node[k], np) : ""}</li>`; }); html += "</ul>"; return html; }
  el("deckTree").innerHTML = tree(root); document.querySelectorAll("#deckTree .deck-link").forEach(btn => btn.addEventListener("click", () => { state.selectedDeck = btn.dataset.deck; renderAll(); switchView("study"); }));
}
function renderDeckSelects() {
  const options = ['<option value="">Todos os decks</option>'].concat(getDecks().map(deck => `<option value="${escapeHtmlAttr(deck)}">${escapeHtml(deck)}</option>`)).join("");
  el("studyDeckSelect").innerHTML = options; el("studyDeckSelect").value = state.selectedDeck; el("searchDeckSelect").innerHTML = options; el("searchDeckSelect").value = state.selectedDeck;
}
function renderDashboard() {
  const cards = filteredCards(); const totals = computeTotals(cards); const attempts = totals.correct + totals.wrong; const accuracy = attempts ? Math.round((totals.correct / attempts) * 100) : 0; const studiedUnique = cards.filter(c => (c.stats.reviewed || 0) > 0).length; const progress = cards.length ? Math.round((studiedUnique / cards.length) * 100) : 0; const queues = countQueues(cards);
  el("totalCards").textContent = cards.length.toLocaleString("pt-BR"); el("reviewedCards").textContent = totals.reviewed.toLocaleString("pt-BR"); el("correctCards").textContent = totals.correct.toLocaleString("pt-BR"); el("wrongCards").textContent = totals.wrong.toLocaleString("pt-BR"); el("accuracyRate").textContent = accuracy + "%"; el("totalTimeValue").textContent = formatSeconds(state.totalTime); el("studiedUniqueText").textContent = studiedUnique.toLocaleString("pt-BR") + " estudados"; el("overallProgress").style.width = progress + "%"; el("overallProgressText").textContent = progress + "% dos cards do filtro atual já foram estudados ao menos uma vez.";
  const reviewsToday = state.reviewLog[todayKey()] || 0; const pGoal = Math.min(100, Math.round((reviewsToday / state.dailyGoal) * 100)); el("goalProgressBar").style.width = pGoal + "%"; el("goalProgressText").textContent = `${reviewsToday.toLocaleString("pt-BR")} revisões hoje de uma meta de ${state.dailyGoal.toLocaleString("pt-BR")} (${pGoal}%).`;
  el("queueSummary").innerHTML = [["novos", queues.new],["aprendendo", queues.learning],["revisão", queues.review],["disponíveis hoje", queues.due]].map(([k,v]) => `<div class="summary-item"><div class="muted">${k}</div><strong>${Number(v).toLocaleString("pt-BR")}</strong></div>`).join("");
  renderHeatmap();
  const q = (el("dashboardDeckSearch").value || "").trim().toLowerCase();
  const byDeck = {};
  cards.forEach(card => { if (q && !card.deck.toLowerCase().includes(q) && !shortDeckName(card.deck).toLowerCase().includes(q)) return; if (!byDeck[card.deck]) byDeck[card.deck] = { total:0, reviewed:0, correct:0, wrong:0, new:0, due:0 }; byDeck[card.deck].total++; byDeck[card.deck].reviewed += card.stats.reviewed || 0; byDeck[card.deck].correct += card.stats.correct || 0; byDeck[card.deck].wrong += card.stats.wrong || 0; if (queueName(card) === "new") byDeck[card.deck].new++; if (isDue(card)) byDeck[card.deck].due++; });
  const rows = Object.entries(byDeck).sort((a,b)=>a[0].localeCompare(b[0])); el("visibleDecksText").textContent = rows.length.toLocaleString("pt-BR") + " decks";
  el("dashboardTableBody").innerHTML = rows.map(([deck, info]) => { const att = info.correct + info.wrong; const acc = att ? Math.round((info.correct / att) * 100) : 0; return `<tr><td><button class="deck-link" title="${escapeHtmlAttr(deck)}" data-deck="${escapeHtmlAttr(deck)}">${escapeHtml(shortDeckName(deck))}</button></td><td>${info.total.toLocaleString("pt-BR")}</td><td>${info.reviewed.toLocaleString("pt-BR")}</td><td>${info.correct.toLocaleString("pt-BR")}</td><td>${info.wrong.toLocaleString("pt-BR")}</td><td>${info.new.toLocaleString("pt-BR")}</td><td>${info.due.toLocaleString("pt-BR")}</td><td>${formatSeconds(state.deckTime[deck] || 0)}</td><td>${acc}%</td></tr>`; }).join("") || `<tr><td colspan="9">Nenhum deck encontrado.</td></tr>`;
  document.querySelectorAll("#dashboardTableBody .deck-link").forEach(btn => btn.addEventListener("click", () => { state.selectedDeck = btn.dataset.deck; renderAll(); switchView("study"); }));
}
function renderHeatmap() {
  const days = []; const start = new Date(); start.setHours(0,0,0,0); start.setDate(start.getDate() - 139);
  for (let i=0;i<140;i++) { const d = new Date(start); d.setDate(start.getDate()+i); const key = todayKey(d.getTime()); const count = state.reviewLog[key] || 0; let level = 0; if (count > 0 && count < 10) level = 1; else if (count < 30) level = 2; else if (count < 60) level = 3; else if (count >= 60) level = 4; days.push({ key, count, level }); }
  el("heatmap").innerHTML = days.map(d => `<div class="heat-cell" data-level="${d.level}"><div class="heat-tip">${d.key}: ${d.count} revisão(ões)</div></div>`).join("");
}
function renderSubjects() {
  const q = (el("subjectFilterInput").value || "").trim().toLowerCase();
  const decks = getDecks().filter(deck => !q || deck.toLowerCase().includes(q) || shortDeckName(deck).toLowerCase().includes(q));
  el("subjectCardsGrid").innerHTML = decks.map(deck => {
    const cards = state.cards.filter(c => c.deck === deck);
    const totals = computeTotals(cards);
    const wrongOnly = cards.filter(hasWrong).length;
    const reviewedTodayCount = cards.filter(reviewedToday).length;
    const queues = countQueues(cards);
    const attempts = totals.correct + totals.wrong;
    const acc = attempts ? Math.round((totals.correct / attempts) * 100) : 0;
    return `<div class="subject-card">
      <div class="subject-header">
        <h3 title="${escapeHtmlAttr(deck)}">${escapeHtml(shortDeckName(deck))}</h3>
        <div class="subject-subtitle">${escapeHtml(deck)}</div>
      </div>
      <div class="subject-meta">
        <span class="tag">${cards.length.toLocaleString("pt-BR")} cards</span>
        <span class="tag">${queues.due.toLocaleString("pt-BR")} disponíveis</span>
        <span class="tag">${wrongOnly.toLocaleString("pt-BR")} erradas</span>
        <span class="tag">${reviewedTodayCount.toLocaleString("pt-BR")} hoje</span>
        <span class="tag">${formatSeconds(state.deckTime[deck] || 0)}</span>
        <span class="tag">${acc}% retenção</span>
      </div>
      <div class="toolbar">
        <button class="btn btn-secondary subject-open" data-deck="${escapeHtmlAttr(deck)}">Disponíveis</button>
        <button class="btn btn-primary subject-random" data-deck="${escapeHtmlAttr(deck)}">Diário 20</button>
        <button class="btn btn-danger subject-wrong" data-deck="${escapeHtmlAttr(deck)}">Erradas</button>
        <button class="btn btn-secondary subject-today" data-deck="${escapeHtmlAttr(deck)}">Hoje</button>
      </div>
    </div>`;
  }).join("") || `<div class="panel">Nenhuma matéria encontrada.</div>`;
  document.querySelectorAll(".subject-open").forEach(btn => btn.addEventListener("click", () => configureSubjectMode(btn.dataset.deck, "due")));
  document.querySelectorAll(".subject-random").forEach(btn => btn.addEventListener("click", () => { configureSubjectMode(btn.dataset.deck, "count"); el("studyOrderSelect").value = "random"; el("studyCountInput").value = 20; }));
  document.querySelectorAll(".subject-wrong").forEach(btn => btn.addEventListener("click", () => configureSubjectMode(btn.dataset.deck, "wrong")));
  document.querySelectorAll(".subject-today").forEach(btn => btn.addEventListener("click", () => configureSubjectMode(btn.dataset.deck, "reviewedToday")));
}
function configureSubjectMode(deck, mode) { state.selectedDeck = deck; el("studyModeSelect").value = mode; renderAll(); switchView("study"); }
function getCardsForSelectedDeck() { return state.selectedDeck ? state.cards.filter(c => c.deck === state.selectedDeck) : state.cards; }
function renderStudyInfo() { const mode = el("studyModeSelect").value; let source = getCardsForSelectedDeck(); if (mode === "wrong") source = source.filter(hasWrong); else if (mode === "correct") source = source.filter(hasCorrect); else if (mode === "reviewedToday") source = source.filter(reviewedToday); else if (mode === "new") source = source.filter(c => queueName(c) === "new"); else if (mode === "learning") source = source.filter(c => queueName(c) === "learning"); else if (mode === "review") source = source.filter(c => queueName(c) === "review"); else if (mode === "due") source = source.filter(isDue); const labels = { wrong: "errados ativos", correct: "acertados", reviewedToday: "revisados hoje", new: "novos", learning: "aprendendo", review: "revisão", due: "disponíveis agora", all: "totais", count: "no modo diário" }; el("studyInfoBox").classList.remove("hidden"); el("studyInfoBox").textContent = `${source.length.toLocaleString("pt-BR")} card(s) ${labels[mode] || ""}.`; }
function startSessionTimer(deck) { endSession(false); state.sessionSeconds = 0; state.sessionDeck = deck || "__all__"; state.timerHandle = setInterval(() => { state.sessionSeconds += 1; state.totalTime += 1; state.deckTime[state.sessionDeck] = (state.deckTime[state.sessionDeck] || 0) + 1; updateSessionTimer(); saveStats(); }, 1000); }
function endSession(showMsg = false) { if (state.timerHandle) clearInterval(state.timerHandle); state.timerHandle = null; const elapsed = state.sessionSeconds; state.sessionSeconds = 0; updateSessionTimer(); if (showMsg && elapsed > 0) alert(`Sessão encerrada. Tempo estudado: ${formatSeconds(elapsed)}.`); }
function updateSessionTimer() { el("sessionTimer").textContent = formatSeconds(state.sessionSeconds); const total = state.studyQueue.length || 0; const current = Math.min(state.studyIndex, total); const p = total ? Math.round((current / total) * 100) : 0; el("sessionProgressBar").style.width = p + "%"; }
function startStudy() { const mode = el("studyModeSelect").value; const order = el("studyOrderSelect").value; let source = getCardsForSelectedDeck(); if (mode === "count") { if (order === "random") shuffle(source); else source.sort((a,b)=>a.id-b.id); source = source.slice(0, Math.max(1, Number(el("studyCountInput").value || 20))); } else { if (mode === "wrong") source = source.filter(hasWrong); else if (mode === "correct") source = source.filter(hasCorrect); else if (mode === "reviewedToday") source = source.filter(reviewedToday); else if (mode === "new") source = source.filter(c => queueName(c) === "new"); else if (mode === "learning") source = source.filter(c => queueName(c) === "learning"); else if (mode === "review") source = source.filter(c => queueName(c) === "review"); else if (mode === "due") source = source.filter(isDue); if (order === "random") shuffle(source); else source.sort((a,b)=>a.id-b.id); } state.studyQueue = source.slice(); state.studyIndex = 0; state.revealed = false; if (!state.studyQueue.length) { el("studyEmpty").classList.remove("hidden"); el("studyCard").classList.add("hidden"); el("studyEmpty").textContent = "Nenhum card encontrado para esta configuração."; return; } startSessionTimer(state.selectedDeck || "__all__"); el("studyEmpty").classList.add("hidden"); el("studyCard").classList.remove("hidden"); renderStudyCard(); }
function buildMediaCandidates(original) {
  const cleaned = String(original || "").replace(/^\.\//, "").replace(/^\//, "");
  const fileName = cleaned.split("/").pop();
  if (!fileName) return [];
  const candidates = [];
  if (cleaned.startsWith("media/")) candidates.push(cleaned);
  for (const base of PASTAS_MEDIA) candidates.push(base + fileName);
  return [...new Set(candidates)];
}
function trySetMediaSource(node, original, loader) {
  const cacheKey = String(original || "");
  const cached = MEDIA_PATH_CACHE.get(cacheKey);
  if (cached === null) return;
  const candidates = cached ? [cached] : buildMediaCandidates(original);
  let idx = 0;
  const next = () => {
    if (idx >= candidates.length) {
      MEDIA_PATH_CACHE.set(cacheKey, null);
      if (node.tagName === "AUDIO") {
        node.removeAttribute("src");
        node.style.display = "none";
      } else {
        node.style.display = "none";
      }
      return;
    }
    const candidate = candidates[idx++];
    loader(candidate, () => {
      MEDIA_PATH_CACHE.set(cacheKey, candidate);
      node.style.display = "";
    }, next);
  };
  next();
}
function resolveMediaIn(container) {
  if (!container) return;
  container.querySelectorAll("img").forEach(img => {
    const original = img.getAttribute("src") || "";
    if (!original.startsWith("media/")) return;
    if (img.dataset.mediaResolved === "1") return;
    img.dataset.mediaResolved = "1";
    trySetMediaSource(img, original, (candidate, ok, fail) => {
      img.onload = ok;
      img.onerror = fail;
      img.src = candidate;
    });
  });
  container.querySelectorAll("audio").forEach(audio => {
    const original = audio.getAttribute("src") || "";
    if (!original.startsWith("media/")) return;
    if (audio.dataset.mediaResolved === "1") return;
    audio.dataset.mediaResolved = "1";
    audio.preload = "none";
    trySetMediaSource(audio, original, (candidate, ok, fail) => {
      audio.onloadeddata = () => { audio.onloadeddata = null; audio.onerror = null; ok(); };
      audio.onerror = () => { audio.onloadeddata = null; fail(); };
      audio.src = candidate;
      audio.load();
    });
  });
}
function renderStudyCard() { const card = state.studyQueue[state.studyIndex]; updateSessionTimer(); if (!card) { el("studyCard").classList.add("hidden"); el("studyEmpty").classList.remove("hidden"); el("studyEmpty").textContent = "Revisão finalizada."; endSession(false); renderAll(); return; } el("studyMeta").textContent = shortDeckName(card.deck); el("studyCounter").textContent = `Card ${state.studyIndex + 1} / ${state.studyQueue.length}`; el("studyStateTag").textContent = nomeFila(card); el("studyDueTag").textContent = "Disponível: " + formatDateShort(card.stats?.srs?.dueAt || 0); el("studyFront").innerHTML = card.frontHtml || escapeHtml(card.front); el("studyBack").innerHTML = card.backHtml || escapeHtml(card.back); resolveMediaIn(el("studyFront")); resolveMediaIn(el("studyBack")); el("studyBack").classList.toggle("hidden", !state.revealed); el("showAnswerBtn").classList.toggle("hidden", state.revealed); ["againBtn","hardBtn","goodBtn","easyBtn"].forEach(id => el(id).classList.toggle("hidden", !state.revealed));
  el("showAnswerBtn").title = "Espaço";
  el("againBtn").title = "1";
  el("hardBtn").title = "2";
  el("goodBtn").title = "3";
  el("easyBtn").title = "4";
}
function applySm2(card, grade) { const srs = card.stats.srs || defaultCardStats().srs; const now = nowTs(); if (grade === "again") { srs.state = "learning"; srs.reps = 0; srs.intervalDays = 0; srs.ease = Math.max(1.3, (srs.ease || 2.5) - 0.2); srs.dueAt = now + 10 * 60 * 1000; srs.lapses = (srs.lapses || 0) + 1; card.stats.wrong = (card.stats.wrong || 0) + 1; card.stats.activeWrong = true; } else if (grade === "hard") { srs.state = "learning"; srs.reps = Math.max(1, (srs.reps || 0)); srs.intervalDays = Math.max(1, Math.round(Math.max(1, srs.intervalDays || 1))); srs.ease = Math.max(1.3, (srs.ease || 2.5) - 0.05); srs.dueAt = now + 24 * 60 * 60 * 1000; card.stats.correct = (card.stats.correct || 0) + 1; card.stats.activeWrong = false; } else if (grade === "good") { srs.reps = (srs.reps || 0) + 1; const interval = srs.reps === 1 ? 1 : srs.reps === 2 ? 3 : Math.round((srs.intervalDays || 3) * (srs.ease || 2.5)); srs.intervalDays = Math.max(1, interval); srs.ease = Math.min(3.0, (srs.ease || 2.5) + 0.03); srs.state = "review"; srs.dueAt = now + srs.intervalDays * 24 * 60 * 60 * 1000; card.stats.correct = (card.stats.correct || 0) + 1; card.stats.activeWrong = false; } else if (grade === "easy") { srs.reps = (srs.reps || 0) + 1; const interval = srs.reps === 1 ? 4 : Math.round((Math.max(2, srs.intervalDays || 3)) * ((srs.ease || 2.5) + 0.35)); srs.intervalDays = Math.max(4, interval); srs.ease = Math.min(3.2, (srs.ease || 2.5) + 0.08); srs.state = "review"; srs.dueAt = now + srs.intervalDays * 24 * 60 * 60 * 1000; card.stats.correct = (card.stats.correct || 0) + 1; card.stats.activeWrong = false; } card.stats.srs = srs; card.stats.reviewed = (card.stats.reviewed || 0) + 1; card.stats.lastReviewedDate = todayKey(); }
function answerCard(grade) { if (state.isAnswering) return; state.isAnswering = true; const queueCard = state.studyQueue[state.studyIndex]; const realCard = state.cards.find(c => c.id === queueCard.id); if (!realCard) { state.isAnswering = false; return; } applySm2(realCard, grade); addReviewLog(); saveStats(); state.studyIndex += 1; state.revealed = false; renderStudyCard(); renderDashboard(); renderSubjects(); renderStats(); requestAnimationFrame(() => { state.isAnswering = false; }); }
function renderSearch() {
  const query = state.searchQuery || (el("cardSearchInput").value || "").trim().toLowerCase();
  const deck = el("searchDeckSelect").value || state.selectedDeck || "";
  const queueFilter = el("searchQueueSelect").value || "";
  let cards = state.cards;
  if (deck) cards = cards.filter(card => card.deck === deck);
  if (queueFilter === "new") cards = cards.filter(c => queueName(c) === "new");
  else if (queueFilter === "learning") cards = cards.filter(c => queueName(c) === "learning");
  else if (queueFilter === "review") cards = cards.filter(c => queueName(c) === "review");
  else if (queueFilter === "wrong") cards = cards.filter(hasWrong);
  else if (queueFilter === "today") cards = cards.filter(reviewedToday);
  if (query) cards = cards.filter(card => card.searchText.includes(query));
  el("searchCountText").textContent = cards.length.toLocaleString("pt-BR") + " resultados";
  const totalPages = Math.max(1, Math.ceil(cards.length / PAGE_SIZE));
  if (state.searchPage > totalPages) state.searchPage = totalPages;
  const start = (state.searchPage - 1) * PAGE_SIZE;
  const pageCards = cards.slice(start, start + PAGE_SIZE);
  el("searchResults").innerHTML = pageCards.map(card => `<div class="result-item"><div class="toolbar"><span class="tag" title="${escapeHtmlAttr(card.deck)}">${escapeHtml(card.shortDeck || shortDeckName(card.deck))}</span><span class="tag">${nomeFila(card)}</span><span class="tag">${isDue(card) ? "disponível" : "agendado"}</span></div><div class="result-front">${escapeHtml(card.title || card.shortDeck || shortDeckName(card.deck))}</div><div class="result-back">${card.frontHtml || escapeHtml(card.front)}</div><div class="muted">Respondido: ${(card.stats.reviewed || 0).toLocaleString("pt-BR")} • Acertos: ${(card.stats.correct || 0).toLocaleString("pt-BR")} • Erros: ${(card.stats.wrong || 0).toLocaleString("pt-BR")} • Disponível: ${formatDateShort(card.stats?.srs?.dueAt || 0)}</div></div>`).join("") || `<div class="muted">Nenhum resultado encontrado.</div>`;
  resolveMediaIn(el("searchResults"));
  const pagesToShow = [];
  for (let i = 1; i <= totalPages; i++) if (i === 1 || i === totalPages || Math.abs(i - state.searchPage) <= 2) pagesToShow.push(i);
  el("searchPagination").innerHTML = [...new Set(pagesToShow)].map(page => `<button class="page-btn ${page === state.searchPage ? "active" : ""}" data-page="${page}">${page}</button>`).join("");
  document.querySelectorAll("#searchPagination .page-btn").forEach(btn => btn.addEventListener("click", () => { state.searchPage = Number(btn.dataset.page); renderSearch(); })); }
function renderStats() { const cards = filteredCards(); const totals = computeTotals(cards); const attempts = totals.correct + totals.wrong; const accuracy = attempts ? Math.round((totals.correct / attempts) * 100) : 0; const wrongOnly = cards.filter(hasWrong).length; const queues = countQueues(cards); const currentDeckTime = state.selectedDeck ? formatSeconds(state.deckTime[state.selectedDeck] || 0) : formatSeconds(state.totalTime); const previsaoRetencao = Math.max(0, Math.min(100, Math.round(accuracy * 0.85 + (queues.review ? 10 : 0)))); el("statsSummary").innerHTML = [["Cards no filtro", cards.length.toLocaleString("pt-BR")],["Revisões", totals.reviewed.toLocaleString("pt-BR")],["Acertos", totals.correct.toLocaleString("pt-BR")],["Erros", totals.wrong.toLocaleString("pt-BR")],["Erradas ativas", wrongOnly.toLocaleString("pt-BR")],["Retenção atual", accuracy + "%"],["Previsão de retenção", previsaoRetencao + "%"],["novos", queues.new.toLocaleString("pt-BR")],["aprendendo", queues.learning.toLocaleString("pt-BR")],["revisão", queues.review.toLocaleString("pt-BR")],["disponíveis", queues.due.toLocaleString("pt-BR")],["Tempo no filtro", currentDeckTime]].map(([label, value]) => `<div class="summary-item"><div class="muted">${label}</div><strong>${value}</strong></div>`).join(""); const byDeck = {}; state.cards.forEach(card => { if (!byDeck[card.deck]) byDeck[card.deck] = { total:0, reviewed:0, wrong:0 }; byDeck[card.deck].total++; byDeck[card.deck].reviewed += card.stats.reviewed || 0; byDeck[card.deck].wrong += card.stats.wrong || 0; }); const topDecks = Object.entries(byDeck).sort((a,b) => b[1].total - a[1].total).slice(0,12); el("topDecks").innerHTML = topDecks.map(([deck, info], idx) => `<div class="rank-item"><div class="muted">#${idx + 1}</div><div><strong title="${escapeHtmlAttr(deck)}">${escapeHtml(shortDeckName(deck))}</strong></div><div class="muted">${info.total.toLocaleString("pt-BR")} cards • ${info.reviewed.toLocaleString("pt-BR")} revisões</div></div>`).join(""); const timeRows = Object.entries(state.deckTime).sort((a,b)=>b[1]-a[1]).slice(0,20); el("timePerDeckList").innerHTML = timeRows.map(([deck, sec], idx) => `<div class="rank-item"><div class="muted">#${idx + 1}</div><div><strong title="${escapeHtmlAttr(deck)}">${escapeHtml(deck === "__all__" ? "Sessões com todos os decks" : shortDeckName(deck))}</strong></div><div class="muted">${formatSeconds(sec)}</div></div>`).join("") || `<div class="muted">Ainda não há tempo registrado.</div>`; const worstRows = Object.entries(byDeck).sort((a,b)=>b[1].wrong-a[1].wrong).slice(0,20); el("worstDecksList").innerHTML = worstRows.map(([deck, info], idx) => `<div class="rank-item"><div class="muted">#${idx + 1}</div><div><strong title="${escapeHtmlAttr(deck)}">${escapeHtml(shortDeckName(deck))}</strong></div><div class="muted">${info.wrong.toLocaleString("pt-BR")} erro(s)</div></div>`).join("") || `<div class="muted">Ainda não há erros registrados.</div>`; }
function resetAll() { if (!confirm("Deseja zerar estatísticas, filas, tempo, heatmap e meta diária?")) return; state.cards = state.cards.map(card => ({ ...card, stats: defaultCardStats() })); state.deckTime = {}; state.totalTime = 0; state.dailyGoal = 50; state.reviewLog = {}; localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(DECK_TIME_KEY); localStorage.removeItem(TOTAL_TIME_KEY); localStorage.removeItem(GOAL_KEY); localStorage.removeItem(REVIEW_LOG_KEY); saveStats(); renderAll(); }
function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } }
boot();
