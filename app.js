
const STORAGE_KEY = "anking_v17_stats";
const PASTAS_MEDIA = Array.from({ length: 23 }, (_, i) => `media/media_${i + 1}/`);

let cards = [];
let queue = [];
let currentIndex = 0;
let currentDeck = "";
let currentMode = "all";
let stats = loadStats();

function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveStats() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}
function updateStatus(t){ document.getElementById("status").innerText = t; }
function updateProgress(p){ document.getElementById("progress").style.width = p + "%"; }

function escapeHtml(v){
  return String(v)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function tituloDidatico(deck) {
  if (!deck) return "";
  const partes = String(deck).split("::").filter(Boolean);
  const ignorar = new Set(["AnKing", "AnKingMed", "Lolnotacop", "Etc", "Zanki Step Decks"]);
  const uteis = partes.filter(p => !ignorar.has(p));
  const base = uteis.length ? uteis : partes;
  if (base.length >= 2) return `${base[base.length - 2]} • ${base[base.length - 1]}`;
  return base[base.length - 1] || deck;
}

function normalizeCard(c) {
  const question = c.frontHtml || c.question || c.front || "";
  const answer = c.backHtml || c.answer || c.back || "";
  const deck = c.deck || "Sem deck";
  const title = c.title || tituloDidatico(deck);
  return {
    id: c.id || Math.random().toString(36).slice(2),
    deck,
    title,
    question,
    answer
  };
}

function getCardStats(id) {
  if (!stats[id]) stats[id] = { reviewed: 0, correct: 0, wrong: 0, activeWrong: false };
  return stats[id];
}

async function boot(){
  updateStatus("Carregando cartões...");
  const files = ["cards_part1.json","cards_part2.json","cards_part3.json","cards_part4.json"];
  let loaded = 0;

  for(const f of files){
    try{
      const r = await fetch(f);
      const j = await r.json();
      cards.push(...j.map(normalizeCard));
    }catch(e){
      console.warn("Falha ao ler", f, e);
    }
    loaded++;
    updateProgress((loaded/files.length)*100);
  }

  if(cards.length===0){
    updateStatus("Nenhum cartão encontrado.");
    return;
  }

  preencherDecks();
  ligarEventos();
  montarFila();
  startApp();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }
}

function preencherDecks() {
  const sel = document.getElementById("deckFilter");
  const decks = [...new Set(cards.map(c => c.deck))].sort((a,b)=>a.localeCompare(b));
  sel.innerHTML = '<option value="">Todos os decks</option>' + decks.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(tituloDidatico(d))}</option>`).join("");
}

function ligarEventos(){
  document.getElementById("deckFilter").onchange = (e) => {
    currentDeck = e.target.value;
    montarFila();
    showCard();
  };
  document.getElementById("modeFilter").onchange = (e) => {
    currentMode = e.target.value;
    montarFila();
    showCard();
  };
  document.getElementById("randomMode").onchange = () => {
    montarFila();
    showCard();
  };
  document.getElementById("countInput").onchange = () => {
    montarFila();
    showCard();
  };
  document.getElementById("restartBtn").onclick = () => {
    montarFila();
    showCard();
  };

  document.getElementById("showAnswerBtn").onclick = showAnswer;
  document.getElementById("againBtn").onclick = (e) => { e.preventDefault(); responder("again"); };
  document.getElementById("hardBtn").onclick = (e) => { e.preventDefault(); responder("hard"); };
  document.getElementById("goodBtn").onclick = (e) => { e.preventDefault(); responder("good"); };
  document.getElementById("easyBtn").onclick = (e) => { e.preventDefault(); responder("easy"); };
}

function filtrarCards(){
  let visiveis = cards.filter(c => !currentDeck || c.deck === currentDeck);
  if (currentMode === "wrong") {
    visiveis = visiveis.filter(c => getCardStats(c.id).activeWrong);
  }
  return visiveis;
}

function montarFila() {
  queue = filtrarCards();

  const limit = Number(document.getElementById("countInput").value || 0);
  if (document.getElementById("randomMode").checked) {
    shuffle(queue);
  } else {
    queue.sort((a,b) => a.deck.localeCompare(b.deck) || String(a.title).localeCompare(String(b.title)));
  }
  if (limit > 0) queue = queue.slice(0, limit);

  currentIndex = 0;
  updateCounters();
  document.getElementById("doneBox").classList.add("hidden");
}

function startApp(){
  document.getElementById("loader").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  showCard();
}

function showCard(){
  if (!queue.length) {
    document.getElementById("question").innerHTML = "";
    document.getElementById("answer").innerHTML = "";
    document.getElementById("cardTitle").textContent = "Nenhum card nesta seleção";
    document.getElementById("cardDeckShort").textContent = "Sem cards";
    document.getElementById("cardDeckFull").textContent = "";
    document.getElementById("cardCounter").textContent = "0 / 0";
    document.getElementById("showAnswerBtn").classList.add("hidden");
    ["againBtn","hardBtn","goodBtn","easyBtn"].forEach(id => document.getElementById(id).classList.add("hidden"));
    document.getElementById("doneBox").classList.remove("hidden");
    return;
  }

  if (currentIndex >= queue.length) {
    currentIndex = 0;
    document.getElementById("doneBox").classList.remove("hidden");
  } else {
    document.getElementById("doneBox").classList.add("hidden");
  }

  const c = queue[currentIndex];
  document.getElementById("cardTitle").textContent = c.title || tituloDidatico(c.deck);
  document.getElementById("cardDeckShort").textContent = tituloDidatico(c.deck);
  document.getElementById("cardDeckFull").textContent = c.deck;
  document.getElementById("cardCounter").textContent = `Card ${currentIndex + 1} / ${queue.length}`;

  document.getElementById("question").innerHTML = c.question || "";
  document.getElementById("answer").innerHTML = c.answer || "";
  document.getElementById("answer").classList.add("hidden");

  document.getElementById("showAnswerBtn").classList.remove("hidden");
  ["againBtn","hardBtn","goodBtn","easyBtn"].forEach(id => document.getElementById(id).classList.add("hidden"));

  resolveMediaIn(document.getElementById("question"));
  resolveMediaIn(document.getElementById("answer"));
  updateCounters();
}

function showAnswer(){
  document.getElementById("answer").classList.remove("hidden");
  document.getElementById("showAnswerBtn").classList.add("hidden");
  ["againBtn","hardBtn","goodBtn","easyBtn"].forEach(id => document.getElementById(id).classList.remove("hidden"));
}

function responder(grade){
  const c = queue[currentIndex];
  if (!c) return;

  const s = getCardStats(c.id);
  s.reviewed += 1;

  if (grade === "again") {
    s.wrong += 1;
    s.activeWrong = true;
    const clone = { ...c };
    const pos = Math.min(queue.length, currentIndex + 4);
    queue.splice(pos, 0, clone);
  } else if (grade === "hard") {
    s.correct += 1;
    s.activeWrong = false;
    const clone = { ...c };
    const pos = Math.min(queue.length, currentIndex + 8);
    queue.splice(pos, 0, clone);
  } else {
    s.correct += 1;
    s.activeWrong = false;
  }

  saveStats();
  currentIndex += 1;
  showCard();
}

function resolveMediaIn(container){
  if(!container) return;

  container.querySelectorAll("img").forEach(img => {
    const original = img.getAttribute("src") || "";
    if (!original.startsWith("media/")) return;
    if (img.dataset.mediaCorrigida === "1") return;

    const nome = decodeURIComponent(original.split("/").pop());
    let tentativa = 0;
    img.dataset.mediaCorrigida = "1";

    img.onerror = function(){
      tentativa += 1;
      if (tentativa < PASTAS_MEDIA.length) {
        this.src = PASTAS_MEDIA[tentativa] + nome;
      }
    };

    img.src = PASTAS_MEDIA[0] + nome;
  });

  container.querySelectorAll("audio").forEach(audio => {
    const original = audio.getAttribute("src") || "";
    if (!original.startsWith("media/")) return;
    if (audio.dataset.mediaCorrigida === "1") return;

    const nome = decodeURIComponent(original.split("/").pop());
    let tentativa = 0;
    audio.dataset.mediaCorrigida = "1";

    audio.onerror = function(){
      tentativa += 1;
      if (tentativa < PASTAS_MEDIA.length) {
        this.src = PASTAS_MEDIA[tentativa] + nome;
        this.load();
      }
    };

    audio.src = PASTAS_MEDIA[0] + nome;
    audio.load();
  });
}

function updateCounters() {
  const visiveis = filtrarCards();
  let reviewed = 0, correct = 0, wrong = 0;

  visiveis.forEach(c => {
    const s = stats[c.id] || { reviewed:0, correct:0, wrong:0 };
    reviewed += s.reviewed;
    correct += s.correct;
    wrong += s.wrong;
  });

  document.getElementById("totalCards").innerText = visiveis.length.toLocaleString("pt-BR");
  document.getElementById("reviewedCards").innerText = reviewed.toLocaleString("pt-BR");
  document.getElementById("correctCards").innerText = correct.toLocaleString("pt-BR");
  document.getElementById("wrongCards").innerText = wrong.toLocaleString("pt-BR");
}

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
}

boot();
