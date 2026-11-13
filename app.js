// ============================================================
//  Bebek Günlüğü — uygulamanın ana kodu
//  Kayıtlar Firebase Firestore'da "kayitlar" koleksiyonunda,
//  bebeğin adı ve doğum tarihi "bebek/profil" belgesinde durur.
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, query, orderBy, limit, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, KISILER } from "./firebase-config.js";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- Kurulum kontrolü ----------
if (!firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("BURAYA")) {
  $("#configView").hidden = false;
  throw new Error("firebase-config.js doldurulmamış");
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// İnternet kesilse bile kayıt girilebilsin diye telefonda yerel kopya tutulur;
// bağlantı gelince otomatik gönderilir.
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
const kayitlar = collection(db, "kayitlar");
const profilRef = doc(db, "bebek", "profil");

const TYPES = { uyku: "Uyku", emzirme: "Emzirme", biberon: "Biberon", olcum: "Kilo / Boy", ilac: "İlaç", ates: "Ateş" };
let entries = [], profile = null, loaded = false, profileLoaded = false, myEmail = "";
let unsubs = [], tick = null;

// ---------- Yardımcılar ----------
const pad = n => String(n).padStart(2, "0");
const hm = ms => { const d = new Date(ms); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
const toLocal = ms => { const d = new Date(ms); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()); };
const fromLocal = v => v ? new Date(v).getTime() : null;
const dayStart = ms => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
function dur(min) { min = Math.max(0, Math.round(min)); const h = Math.floor(min / 60), m = min % 60; return h ? (h + " sa " + (m ? m + " dk" : "")).trim() : m + " dk"; }
const ago = ms => { const m = (Date.now() - ms) / 60000; return m < 1 ? "az önce" : dur(m) + " önce"; };
const fmtNum = (n, d = 1) => Number(n).toLocaleString("tr-TR", { maximumFractionDigits: d });
function dayLabel(ds) {
  const t = dayStart(Date.now());
  if (ds === t) return "Bugün";
  if (ds === dayStart(t - 1)) return "Dün";
  return new Date(ds).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
}
const kisiAdi = email => !email ? "" : email === myEmail ? "Sen" : (KISILER[email.toLowerCase()] || email.split("@")[0]);

function describe(e) {
  switch (e.tur) {
    case "uyku": return e.end ? "Uyku · " + dur((e.end - e.t) / 60000) + " (" + hm(e.t) + "–" + hm(e.end) + ")" : "Uyuyor · " + hm(e.t) + "'den beri";
    case "emzirme": return "Emzirme" + (e.taraf ? " · " + e.taraf : "") + (e.dk ? " · " + e.dk + " dk" : "");
    case "biberon": return "Biberon" + (e.ml ? " · " + e.ml + " ml" : "") + (e.icerik ? " · " + e.icerik : "");
    case "olcum": return [e.kg ? fmtNum(e.kg, 3) + " kg" : "", e.cm ? fmtNum(e.cm) + " cm" : ""].filter(Boolean).join(" · ") || "Ölçüm";
    case "ilac": return (e.ad || "İlaç") + (e.doz ? " · " + e.doz : "");
    case "ates": return "Ateş · " + fmtNum(e.derece) + " °C";
  }
  return e.tur;
}
function showBanner(t) { const b = $("#banner"); b.textContent = t || ""; b.hidden = !t; }
function hataMesaji(e) {
  if (e && e.code === "permission-denied") return "Bu hesabın izni yok. E-postanı firestore.rules içindeki listeye ekle.";
  return "Kaydedilemedi. Bağlantını kontrol edip tekrar dene.";
}
// Yazma işlemleri: internet yoksa bile hemen ekranda görünür, sonra gönderilir.
// Bu yüzden sonucu beklemiyoruz; sadece hata olursa haber veriyoruz.
const yaz = p => p.catch(e => showBanner(hataMesaji(e)));

// ---------- Giriş ----------
onAuthStateChanged(auth, user => {
  unsubs.forEach(u => u()); unsubs = []; clearInterval(tick);
  if (!user) { $("#appView").hidden = true; $("#loginView").hidden = false; return; }
  myEmail = (user.email || "").toLowerCase();
  $("#loginView").hidden = true; $("#appView").hidden = false;
  startData();
});
$("#loginForm").addEventListener("submit", async ev => {
  ev.preventDefault(); $("#lErr").textContent = "";
  try { await signInWithEmailAndPassword(auth, $("#lEmail").value.trim(), $("#lPass").value); }
  catch (e) {
    $("#lErr").textContent = ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"].includes(e.code)
      ? "E-posta ya da şifre yanlış." : e.code === "auth/too-many-requests" ? "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene." : "Giriş yapılamadı. İnternet bağlantını kontrol et.";
  }
});
$("#logout").onclick = () => signOut(auth);

function startData() {
  loaded = false; profileLoaded = false; entries = []; profile = null; renderAll();
  unsubs.push(onSnapshot(query(kayitlar, orderBy("t", "desc"), limit(1000)), snap => {
    entries = snap.docs.map(d => ({ ...d.data(), _id: d.id })).filter(e => TYPES[e.tur] && typeof e.t === "number");
    loaded = true; showBanner(""); renderAll();
  }, e => { loaded = true; showBanner(hataMesaji(e)); renderAll(); }));
  unsubs.push(onSnapshot(profilRef, s => { profile = s.exists() ? s.data() : null; profileLoaded = true; renderHeader(); },
    () => { profileLoaded = true; }));
  tick = setInterval(() => { if (loaded) renderStatus(); }, 30000);
}

// ---------- Ekrana çizme ----------
function renderHeader() {
  $("#babyName").textContent = (profile && profile.ad) || "Bebek Günlüğü";
  if (profile && profile.dogum) {
    const g = Math.floor((dayStart(Date.now()) - new Date(profile.dogum + "T00:00").getTime()) / 864e5);
    $("#babyAge").textContent = g < 0 ? "" : g < 14 ? g + " günlük" : g < 84 ? Math.floor(g / 7) + " haftalık (" + g + " gün)" : Math.floor(g / 30.44) + " aylık (" + g + " gün)";
  } else $("#babyAge").textContent = loaded ? "Uyku, beslenme ve sağlık kayıtları" : "Kayıtlar yükleniyor…";
  $("#editProfile").hidden = !(profileLoaded && profile);
  const box = $("#setupBox");
  if (profileLoaded && !profile && !box.dataset.open) { box.dataset.open = "1"; box.innerHTML = setupHtml(); bindSetup(); }
  if (profile && box.dataset.open === "1") { box.innerHTML = ""; delete box.dataset.open; }
}
function setupHtml(p = {}) {
  return `<form class="card" id="setupForm">
  <h2 style="font-size:1.15rem">Bebeğin bilgileri</h2>
  <div class="note">Yaşı otomatik hesaplamak için. Sonradan değiştirebilirsin.</div>
  <div class="two"><div class="field"><label for="pAd">Adı</label><input id="pAd" value="${esc(p.ad)}" required maxlength="40"></div>
  <div class="field"><label for="pDogum">Doğum tarihi</label><input id="pDogum" type="date" value="${esc(p.dogum)}"></div></div>
  <div class="btns"><button class="primary" type="submit">Kaydet</button>${p.ad ? '<button type="button" class="secondary" id="pCancel">Vazgeç</button>' : ""}</div></form>`;
}
function bindSetup() {
  const box = $("#setupBox");
  $("#setupForm").addEventListener("submit", ev => {
    ev.preventDefault();
    yaz(setDoc(profilRef, { ad: $("#pAd").value.trim(), dogum: $("#pDogum").value || "" }));
    box.innerHTML = ""; delete box.dataset.open;
  });
  const c = $("#pCancel"); if (c) c.onclick = () => { box.innerHTML = ""; box.dataset.open = "x"; };
}
$("#editProfile").onclick = () => { const box = $("#setupBox"); box.dataset.open = "2"; box.innerHTML = setupHtml(profile); bindSetup(); };

const ongoingSleep = () => entries.find(e => e.tur === "uyku" && !e.end);

function renderStatus() {
  const now = Date.now(), t0 = dayStart(now);
  const feeds = entries.filter(e => e.tur === "emzirme" || e.tur === "biberon");
  const lastFeed = feeds.reduce((a, e) => !a || e.t > a.t ? e : a, null);
  const todayFeeds = feeds.filter(e => e.t >= t0);
  const ml = todayFeeds.reduce((s, e) => s + (e.tur === "biberon" && +e.ml ? +e.ml : 0), 0);
  let sleepMin = 0;
  entries.filter(e => e.tur === "uyku").forEach(e => { const a = Math.max(e.t, t0), b = Math.min(e.end || now, now); if (b > a) sleepMin += (b - a) / 60000; });
  const os = ongoingSleep();
  const lastSleepEnd = entries.filter(e => e.tur === "uyku" && e.end).reduce((a, e) => Math.max(a, e.end), 0);
  const kg = entries.filter(e => e.tur === "olcum" && e.kg).sort((a, b) => b.t - a.t)[0];
  const fev = entries.filter(e => e.tur === "ates" && now - e.t < 24 * 36e5).sort((a, b) => b.t - a.t)[0];
  const cards = [];
  cards.push(`<div class="stat"><div class="k">Son beslenme</div><div class="v num">${lastFeed ? ago(lastFeed.t) : "—"}</div><div class="s">${lastFeed ? hm(lastFeed.t) + " · " + esc(describe(lastFeed)) : "Henüz kayıt yok"}</div></div>`);
  cards.push(`<div class="stat"><div class="k">${os ? "Uyuyor" : "Uyanık"}</div><div class="v num">${os ? dur((now - os.t) / 60000) : lastSleepEnd ? dur((now - lastSleepEnd) / 60000) : "—"}</div><div class="s">${os ? hm(os.t) + "'den beri" : lastSleepEnd ? hm(lastSleepEnd) + "'de uyandı" : "Uyku kaydı yok"}</div></div>`);
  cards.push(`<div class="stat"><div class="k">Bugün uyku</div><div class="v num">${dur(sleepMin)}</div><div class="s">Gece yarısından bu yana</div></div>`);
  cards.push(`<div class="stat"><div class="k">Bugün beslenme</div><div class="v num">${todayFeeds.length} kez</div><div class="s num">${ml ? "Biberon toplam " + ml + " ml" : "Biberon yok"}</div></div>`);
  if (fev) cards.push(`<div class="stat ${fev.derece >= 38 ? "fever" : ""}"><div class="k">Son ateş</div><div class="v num">${fmtNum(fev.derece)} °C</div><div class="s">${ago(fev.t)}${fev.derece >= 38 ? " · 3 aydan küçük bebekte 38 °C ve üstü için doktoru ara" : ""}</div></div>`);
  if (kg) cards.push(`<div class="stat"><div class="k">Son kilo</div><div class="v num">${fmtNum(kg.kg, 3)} kg</div><div class="s">${new Date(kg.t).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}</div></div>`);
  $("#status").innerHTML = cards.join("");
  const b = $("#sleepBtn");
  b.disabled = !loaded;
  if (os) { b.className = "sleepbtn awake"; b.innerHTML = `Uyandı<small>${dur((now - os.t) / 60000)} uyudu · uykuyu bitir</small>`; }
  else { b.className = "sleepbtn"; b.innerHTML = "Uyudu<small>Uykuyu şimdi başlat</small>"; }
  document.querySelectorAll(".qb").forEach(q => q.disabled = !loaded);
}

let confirmId = null;
function renderTimeline() {
  const el = $("#timeline");
  if (!loaded) { el.innerHTML = `<div class="empty">Kayıtlar yükleniyor…</div>`; return; }
  if (!entries.length) { el.innerHTML = `<div class="empty">Henüz kayıt yok. Yukarıdaki düğmelerle ilk uykuyu ya da beslenmeyi ekle; eklediğin her şey burada saat sırasıyla görünür.</div>`; return; }
  const groups = new Map();
  entries.forEach(e => { const k = dayStart(e.t); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); });
  let html = "";
  for (const [k, list] of groups) {
    html += `<div class="day"><h3>${esc(dayLabel(k))}</h3><div class="list">`;
    list.forEach(e => {
      const who = kisiAdi(e.by);
      const extra = [who ? esc(who) + " ekledi" : "", e.not ? esc(e.not) : ""].filter(Boolean).join(" · ");
      const hot = e.tur === "ates" && e.derece >= 38;
      const acts = confirmId === e._id
        ? `<button class="icon danger" data-del="${e._id}">Evet, sil</button><button class="icon" data-cancel>Vazgeç</button>`
        : `<button class="icon" data-edit="${e._id}">Düzenle</button><button class="icon" data-ask="${e._id}">Sil</button>`;
      html += `<div class="row${hot ? " hot" : ""}"><span class="time num">${hm(e.t)}</span><span class="dot d-${e.tur}"></span>
        <span class="what"><b>${esc(describe(e))}</b>${extra ? `<span class="by">${extra}</span>` : ""}</span><span class="acts">${acts}</span></div>`;
    });
    html += "</div></div>";
  }
  el.innerHTML = html;
}
function renderAll() { renderHeader(); renderStatus(); renderTimeline(); }

// ---------- Kayıt formu ----------
let form = null;
function openForm(tur, existing) {
  const e = existing ? { ...existing } : { tur, t: Date.now() };
  form = { tur: e.tur, id: existing ? existing._id : null, taraf: e.taraf || "Sol", icerik: e.icerik || "Anne sütü" };
  if (!existing && tur === "emzirme") { const last = entries.find(x => x.tur === "emzirme" && x.taraf); if (last) form.taraf = last.taraf === "Sol" ? "Sağ" : "Sol"; }
  const f = [];
  f.push(`<div class="field"><label for="fT">${e.tur === "uyku" ? "Uyudu" : "Saat"}</label><input id="fT" type="datetime-local" value="${toLocal(e.t)}" required></div>`);
  if (e.tur === "uyku") f.push(`<div class="field"><label for="fEnd">Uyandı (hâlâ uyuyorsa boş bırak)</label><input id="fEnd" type="datetime-local" value="${e.end ? toLocal(e.end) : existing ? "" : toLocal(Date.now())}"></div>`);
  if (e.tur === "emzirme") f.push(`<div class="field"><label>Taraf</label><div class="seg" data-seg="taraf">${["Sol", "Sağ", "İkisi"].map(x => `<button type="button" aria-pressed="${form.taraf === x}">${x}</button>`).join("")}</div></div>
    <div class="field"><label for="fDk">Süre (dakika)</label><input id="fDk" type="number" inputmode="numeric" min="0" max="180" value="${esc(e.dk ?? "")}"></div>`);
  if (e.tur === "biberon") f.push(`<div class="field"><label>İçerik</label><div class="seg" data-seg="icerik">${["Anne sütü", "Mama"].map(x => `<button type="button" aria-pressed="${form.icerik === x}">${x}</button>`).join("")}</div></div>
    <div class="field"><label for="fMl">Miktar (ml)</label><input id="fMl" type="number" inputmode="numeric" min="0" max="400" step="5" value="${esc(e.ml ?? "")}"></div>`);
  if (e.tur === "olcum") f.push(`<div class="two"><div class="field"><label for="fKg">Kilo (kg)</label><input id="fKg" type="number" inputmode="decimal" min="0" max="30" step="0.005" placeholder="3,450" value="${esc(e.kg ?? "")}"></div>
    <div class="field"><label for="fCm">Boy (cm)</label><input id="fCm" type="number" inputmode="decimal" min="0" max="120" step="0.1" placeholder="51" value="${esc(e.cm ?? "")}"></div></div>`);
  if (e.tur === "ilac") f.push(`<div class="field"><label for="fAd">İlaç / vitamin adı</label><input id="fAd" maxlength="60" placeholder="D vitamini" value="${esc(e.ad ?? "")}" required></div>
    <div class="field"><label for="fDoz">Doz</label><input id="fDoz" maxlength="40" placeholder="3 damla" value="${esc(e.doz ?? "")}"></div>`);
  if (e.tur === "ates") f.push(`<div class="field"><label for="fDer">Derece (°C)</label><input id="fDer" type="number" inputmode="decimal" min="34" max="43" step="0.1" placeholder="37,2" value="${esc(e.derece ?? "")}" required></div>`);
  f.push(`<div class="field"><label for="fNot">Not (isteğe bağlı)</label><input id="fNot" maxlength="140" value="${esc(e.not ?? "")}"></div>`);
  $("#sheetHost").innerHTML = `<div class="sheet-bg" id="sheetBg"><form class="sheet" id="sheetForm" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
    <h2 id="sheetTitle"><span class="dot d-${e.tur}"></span>${existing ? "Düzenle: " : ""}${TYPES[e.tur]}</h2>${f.join("")}
    <div class="err" id="fErr"></div>
    <div class="btns"><button class="primary" type="submit">${existing ? "Güncelle" : "Kaydet"}</button><button class="secondary" type="button" id="fCancel">Vazgeç</button></div></form></div>`;
  document.querySelectorAll("[data-seg]").forEach(seg => seg.addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); form[seg.dataset.seg] = b.textContent;
  }));
  $("#fCancel").onclick = closeForm;
  $("#sheetBg").addEventListener("click", ev => { if (ev.target.id === "sheetBg") closeForm(); });
  $("#sheetForm").addEventListener("submit", saveForm);
}
function closeForm() { $("#sheetHost").innerHTML = ""; form = null; }
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && form) closeForm(); });
const numv = id => { const el = $(id); if (!el || el.value === "") return null; const n = parseFloat(String(el.value).replace(",", ".")); return isNaN(n) ? null : n; };

function saveForm(ev) {
  ev.preventDefault();
  const err = $("#fErr"); err.textContent = "";
  const t = fromLocal($("#fT").value);
  if (!t) { err.textContent = "Saati gir."; return; }
  const d = { tur: form.tur, t };
  const nt = $("#fNot").value.trim(); if (nt) d.not = nt;
  if (form.tur === "uyku") {
    const end = fromLocal($("#fEnd").value);
    if (end) { if (end <= t) { err.textContent = "Uyanma saati uyuma saatinden sonra olmalı."; return; } d.end = end; }
    else { const os = ongoingSleep(); if (os && os._id !== form.id) { err.textContent = "Zaten devam eden bir uyku var. Önce onu bitir."; return; } }
  }
  if (form.tur === "emzirme") { d.taraf = form.taraf; const dk = numv("#fDk"); if (dk != null) d.dk = dk; }
  if (form.tur === "biberon") { d.icerik = form.icerik; const ml = numv("#fMl"); if (ml != null) d.ml = ml; }
  if (form.tur === "olcum") { const kg = numv("#fKg"), cm = numv("#fCm"); if (kg == null && cm == null) { err.textContent = "Kilo ya da boydan en az birini gir."; return; } if (kg != null) d.kg = kg; if (cm != null) d.cm = cm; }
  if (form.tur === "ilac") { d.ad = $("#fAd").value.trim(); const dz = $("#fDoz").value.trim(); if (dz) d.doz = dz; if (!d.ad) { err.textContent = "İlaç adını gir."; return; } }
  if (form.tur === "ates") { const dg = numv("#fDer"); if (dg == null) { err.textContent = "Dereceyi gir."; return; } d.derece = dg; }
  const old = form.id ? entries.find(x => x._id === form.id) : null;
  d.by = (old && old.by) || myEmail;
  yaz(form.id ? setDoc(doc(kayitlar, form.id), d) : addDoc(kayitlar, d));
  closeForm();
}

// ---------- Düğmeler ----------
document.querySelectorAll("[data-new]").forEach(b => b.addEventListener("click", () => openForm(b.dataset.new)));
$("#sleepBtn").addEventListener("click", () => {
  const os = ongoingSleep();
  if (os) yaz(updateDoc(doc(kayitlar, os._id), { end: Date.now() }));
  else yaz(addDoc(kayitlar, { tur: "uyku", t: Date.now(), by: myEmail }));
});
$("#timeline").addEventListener("click", ev => {
  const b = ev.target.closest("button"); if (!b) return;
  if (b.dataset.edit) { const e = entries.find(x => x._id === b.dataset.edit); if (e) openForm(e.tur, e); }
  else if (b.dataset.ask) { confirmId = b.dataset.ask; renderTimeline(); }
  else if (b.hasAttribute("data-cancel")) { confirmId = null; renderTimeline(); }
  else if (b.dataset.del) { const id = b.dataset.del; confirmId = null; yaz(deleteDoc(doc(kayitlar, id))); }
});
