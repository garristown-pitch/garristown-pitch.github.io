import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, serverTimestamp} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDNoh9ECHtJm3kYgxtLxkkid2X6sBrczis",
  authDomain: "garristown-pitch-github-io.firebaseapp.com",
  projectId: "garristown-pitch-github-io",
  storageBucket: "garristown-pitch-github-io.firebasestorage.app",
  messagingSenderId: "1013736274133",
  appId: "1:1013736274133:web:570f1714494ca0210d8a5c"
};

const ADMIN_EMAIL = "admin@gfc.ie";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const el = (id) => document.getElementById(id);

const dateInput = el("dateInput");
const dateHint = el("dateHint");
const scheduleTable = el("scheduleTable");
const statusBar = el("statusBar");

const authPill = el("authPill");
const loginBtn = el("loginBtn");
const logoutBtn = el("logoutBtn");
const manageBtn = el("manageBtn");

const loginModal = el("loginModal");
const loginClose = el("loginClose");
const loginForm = el("loginForm");
const passwordInput = el("passwordInput");
const loginError = el("loginError");

const cellModal = el("cellModal");
const cellClose = el("cellClose");
const cellDate = el("cellDate");
const cellPitch = el("cellPitch");
const cellSlot = el("cellSlot");
const cellStatus = el("cellStatus");
const cellNotes = el("cellNotes");
const cellSave = el("cellSave");
const cellDelete = el("cellDelete");
const cellError = el("cellError");

const manageModal = el("manageModal");
const manageClose = el("manageClose");
const pitchesList = el("pitchesList");
const slotsList = el("slotsList");
const newPitchName = el("newPitchName");
const addPitchBtn = el("addPitchBtn");
const newSlot = el("newSlot");
const addSlotBtn = el("addSlotBtn");
const manageSave = el("manageSave");
const manageError = el("manageError");

let isAdmin = false;
let pitches = [];
let slots = [];
let dayCells = new Map();
let selectedDateId = "";

let selectedPitch = null;
let selectedSlot = null;

function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function addDaysISO(isoDate, days) {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function setStatus(msg) {
  statusBar.textContent = msg || "";
}

function showError(targetEl, msg) {
  targetEl.textContent = msg;
  targetEl.classList.remove("hidden");
}

function clearError(targetEl) {
  targetEl.textContent = "";
  targetEl.classList.add("hidden");
}

function cellIdFor(pitchId, slotStr) {
  const slotKey = slotStr.replaceAll(":", "");
  return `${pitchId}__${slotKey}`;
}

async function loadConfig() {
  const pitchesSnap = await getDoc(doc(db, "config", "pitches"));
  const slotsSnap = await getDoc(doc(db, "config", "timeslots"));

  pitches = (pitchesSnap.exists() && Array.isArray(pitchesSnap.data().pitches))
    ? pitchesSnap.data().pitches
    : [];

  slots = (slotsSnap.exists() && Array.isArray(slotsSnap.data().slots))
    ? slotsSnap.data().slots
    : [];

  slots.sort((a, b) => a.localeCompare(b));
}

async function loadDay(dateId) {
  const cellsCol = collection(db, "schedule", dateId, "cells");
  const snap = await getDocs(cellsCol);
  const map = new Map();
  snap.forEach((d) => map.set(d.id, d.data()));
  dayCells = map;
}

function renderTable() {
  const thead = [];
  thead.push("<tr>");
  thead.push("<th>Time</th>");
  for (const p of pitches) { thead.push(`<th>${escapeHtml(p.name)}</th>`); }
  thead.push("</tr>");

  const tbody = [];
  for (const s of slots) {
    tbody.push("<tr>");
    tbody.push(`<td>${escapeHtml(s)}</td>`);

    for (const p of pitches) {
      const id = cellIdFor(p.id, s);
      const data = dayCells.get(id) || null;

      const status = (data && data.status) ? data.status : "available";
      const notes = (data && data.notes) ? data.notes : "";

      const mainText = statusLabel(status);
      const notesHtml = notes ? `<div class="cell__notes" title="${escapeHtmlAttr(notes)}">${escapeHtml(notes)}</div>` : "";

      const clickable = isAdmin ? "cell--clickable" : "";
      tbody.push(
        `<td>
          <div class="cell cell--${status} ${clickable}"
               data-pitch-id="${escapeHtmlAttr(p.id)}"
               data-slot="${escapeHtmlAttr(s)}"
               role="${isAdmin ? "button" : "note"}"
               tabindex="${isAdmin ? "0" : "-1"}"
               aria-label="${escapeHtmlAttr(p.name)} ${escapeHtmlAttr(s)} ${escapeHtmlAttr(mainText)}">
            <div class="cell__main">${escapeHtml(mainText)}</div>
            ${notesHtml}
          </div>
        </td>`
      );
    }

    tbody.push("</tr>");
  }

  scheduleTable.innerHTML = `<thead>${thead.join("")}</thead><tbody>${tbody.join("")}</tbody>`;

  if (isAdmin) {
    scheduleTable.querySelectorAll(".cell--clickable").forEach((node) => {
      node.addEventListener("click", () => onCellClick(node));
      node.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") onCellClick(node);
      });
    });
  }
}

function statusLabel(status) {
  switch (status) {
    case "booked": return "Booked";
    case "blocked": return "Blocked";
    default: return "Available";
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]
  ));
}
function escapeHtmlAttr(str) {
  return escapeHtml(str);
}

function onCellClick(node) {
  clearError(cellError);

  const pitchId = node.getAttribute("data-pitch-id");
  const slot = node.getAttribute("data-slot");

  selectedPitch = pitches.find(p => p.id === pitchId) || null;
  selectedSlot = slot;

  if (!selectedPitch || !selectedSlot) return;

  const id = cellIdFor(selectedPitch.id, selectedSlot);
  const data = dayCells.get(id) || null;

  cellDate.textContent = selectedDateId;
  cellPitch.textContent = selectedPitch.name;
  cellSlot.textContent = selectedSlot;

  cellStatus.value = data?.status || "available";
  cellNotes.value = data?.notes || "";

  openModal(cellModal);
}

async function saveCell() {
  clearError(cellError);

  if (!auth.currentUser) {
    showError(cellError, "Not authenticated.");
    return;
  }
  if (!selectedPitch || !selectedSlot) {
    showError(cellError, "No cell selected.");
    return;
  }

  const id = cellIdFor(selectedPitch.id, selectedSlot);
  const payload = {
    status: cellStatus.value,
    notes: (cellNotes.value || "").trim(),
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser.uid
  };

  try {
    await setDoc(doc(db, "schedule", selectedDateId, "cells", id), payload, { merge: true });
    dayCells.set(id, { ...payload, updatedAt: new Date() });
    renderTable();
    closeModal(cellModal);
    setStatus("Saved.");
  } catch (e) {
    showError(cellError, `Save failed: ${friendlyError(e)}`);
  }
}

async function clearCell() {
  clearError(cellError);

  if (!auth.currentUser) {
    showError(cellError, "Not authenticated.");
    return;
  }
  if (!selectedPitch || !selectedSlot) {
    showError(cellError, "No cell selected.");
    return;
  }

  const id = cellIdFor(selectedPitch.id, selectedSlot);

  try {
    await deleteDoc(doc(db, "schedule", selectedDateId, "cells", id));
    dayCells.delete(id);
    renderTable();
    closeModal(cellModal);
    setStatus("Cleared.");
  } catch (e) {
    showError(cellError, `Clear failed: ${friendlyError(e)}`);
  }
}

let draftPitches = [];
let draftSlots = [];

function openManage() {
  clearError(manageError);
  draftPitches = structuredClone(pitches);
  draftSlots = structuredClone(slots);
  renderManageLists();
  openModal(manageModal);
}

function renderManageLists() {
  pitchesList.innerHTML = "";
  slotsList.innerHTML = "";

  for (const p of draftPitches) {
    const row = document.createElement("div");
    row.className = "listrow";
    row.innerHTML = `
      <div class="listrow__left">
        <div class="listrow__title">${escapeHtml(p.name)}</div>
        <div class="listrow__meta">id: ${escapeHtml(p.id)}</div>
      </div>
      <button class="btn btn--danger" type="button">Remove</button>
    `;
    row.querySelector("button").addEventListener("click", () => {
      draftPitches = draftPitches.filter(x => x.id !== p.id);
      renderManageLists();
    });
    pitchesList.appendChild(row);
  }

  for (const s of draftSlots) {
    const row = document.createElement("div");
    row.className = "listrow";
    row.innerHTML = `
      <div class="listrow__left">
        <div class="listrow__title">${escapeHtml(s)}</div>
        <div class="listrow__meta">timeslot</div>
      </div>
      <button class="btn btn--danger" type="button">Remove</button>
    `;
    row.querySelector("button").addEventListener("click", () => {
      draftSlots = draftSlots.filter(x => x !== s);
      renderManageLists();
    });
    slotsList.appendChild(row);
  }
}

function slugId(name) {
  const base = name.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "pitch";
}

function nextPitchId(existingIds, name) {
  const base = slugId(name);
  let candidate = base;
  let i = 2;
  while (existingIds.has(candidate)) {
    candidate = `${base}-${i++}`;
  }
  return candidate;
}

function isValidTimeSlot(s) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

function addPitch() {
  clearError(manageError);
  const name = (newPitchName.value || "").trim();
  if (!name) {
    showError(manageError, "Pitch name is required.");
    return;
  }
  const ids = new Set(draftPitches.map(p => p.id));
  const id = nextPitchId(ids, name);
  draftPitches.push({ id, name });
  newPitchName.value = "";
  renderManageLists();
}

function addSlot() {
  clearError(manageError);
  const s = (newSlot.value || "").trim();
  if (!isValidTimeSlot(s)) {
    showError(manageError, "Timeslot must be in HH:MM (24-hour) format, e.g. 09:00 or 21:30.");
    return;
  }
  if (draftSlots.includes(s)) {
    showError(manageError, "That timeslot already exists.");
    return;
  }
  draftSlots.push(s);
  draftSlots.sort((a, b) => a.localeCompare(b));
  newSlot.value = "";
  renderManageLists();
}

async function saveManage() {
  clearError(manageError);

  if (!auth.currentUser) {
    showError(manageError, "Not authenticated.");
    return;
  }
  if (draftPitches.length === 0) {
    showError(manageError, "You must have at least one pitch.");
    return;
  }
  if (draftSlots.length === 0) {
    showError(manageError, "You must have at least one timeslot.");
    return;
  }

  try {
    await setDoc(doc(db, "config", "pitches"), { pitches: draftPitches }, { merge: false });
    await setDoc(doc(db, "config", "timeslots"), { slots: draftSlots }, { merge: false });

    pitches = structuredClone(draftPitches);
    slots = structuredClone(draftSlots);

    closeModal(manageModal);
    renderTable();
    setStatus("Configuration updated.");
  } catch (e) {
    showError(manageError, `Save failed: ${friendlyError(e)}`);
  }
}

function openModal(modalEl) {
  modalEl.classList.remove("hidden");
}
function closeModal(modalEl) {
  modalEl.classList.add("hidden");
}

loginBtn.addEventListener("click", () => {
  clearError(loginError);
  passwordInput.value = "";
  openModal(loginModal);
  setTimeout(() => passwordInput.focus(), 0);
});
loginClose.addEventListener("click", () => closeModal(loginModal));
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError(loginError);

  const pw = passwordInput.value;
  try {
    await signInWithEmailAndPassword(auth, ADMIN_EMAIL, pw);
    closeModal(loginModal);
    setStatus("Logged in as admin.");
  } catch (err) {
    showError(loginError, `Login failed: ${friendlyError(err)}`);
  }
});

cellClose.addEventListener("click", () => closeModal(cellModal));
cellSave.addEventListener("click", saveCell);
cellDelete.addEventListener("click", clearCell);

manageBtn.addEventListener("click", openManage);
manageClose.addEventListener("click", () => closeModal(manageModal));
addPitchBtn.addEventListener("click", addPitch);
addSlotBtn.addEventListener("click", addSlot);
manageSave.addEventListener("click", saveManage);

onAuthStateChanged(auth, async (user) => {
  isAdmin = !!user;

  authPill.textContent = isAdmin ? "Admin" : "Public";
  authPill.classList.toggle("pill--on", isAdmin);
  authPill.classList.toggle("pill--off", !isAdmin);

  loginBtn.classList.toggle("hidden", isAdmin);
  logoutBtn.classList.toggle("hidden", !isAdmin);
  manageBtn.classList.toggle("hidden", !isAdmin);

  renderTable();
});

function initDatePicker() {
  const min = todayISO();
  const max = addDaysISO(min, 365);

  dateInput.min = min;
  dateInput.max = max;

  selectedDateId = min;
  dateInput.value = selectedDateId;

  dateHint.textContent = `Allowed range: ${min} → ${max}`;

  dateInput.addEventListener("change", async () => {
    clearError(loginError);
    const val = dateInput.value;
    if (!val) return;
    selectedDateId = val;
    await refresh();
  });
}

async function refresh() {
  setStatus("Loading…");
  try {
    await loadConfig();
    await loadDay(selectedDateId);
    renderTable();
    setStatus("");
  } catch (e) {
    setStatus("");
    scheduleTable.innerHTML = "";
    showGlobalError(`Load failed: ${friendlyError(e)}`);
  }
}

function showGlobalError(msg) {
  statusBar.textContent = msg;
}

function friendlyError(e) {
  const code = e?.code || "";
  const msg = e?.message || String(e);

  if (code.includes("auth/invalid-credential")) return "Invalid password.";
  if (code.includes("auth/wrong-password")) return "Invalid password.";
  if (code.includes("auth/too-many-requests")) return "Too many attempts. Try again later.";
  if (code.includes("permission-denied")) return "Permission denied (check Firestore rules).";

  return msg;
}

(async function main() {
  initDatePicker();
  await refresh();
})();
