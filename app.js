import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

/* ----------------------------- Config ----------------------------- */
const firebaseConfig = {

  apiKey: "AIzaSyDNoh9ECHtJm3kYgxtLxkkid2X6sBrczis",
  authDomain: "garristown-pitch-github-io.firebaseapp.com",
  projectId: "garristown-pitch-github-io",
  storageBucket: "garristown-pitch-github-io.firebasestorage.app",
  messagingSenderId: "1013736274133",
  appId: "1:1013736274133:web:570f1714494ca0210d8a5c"

};

const ADMIN_EMAIL = "admin@gfc.ie";

/* ----------------------------- Init ----------------------------- */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ----------------------------- DOM ----------------------------- */
const el = (id) => document.getElementById(id);

const dateInput = el("dateInput");
const dateHint = el("dateHint");
const scheduleTable = el("scheduleTable");
const statusBar = el("statusBar");

const authPill = el("authPill");
const loginBtn = el("loginBtn");
const logoutBtn = el("logoutBtn");
const manageBtn = el("manageBtn");

/* Login modal */
const loginModal = el("loginModal");
const loginClose = el("loginClose");
const loginForm = el("loginForm");
const passwordInput = el("passwordInput");
const loginError = el("loginError");

/* Cell modal */
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

/* Manage modal */
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

/* Bulk apply controls */
const bulkPitch = el("bulkPitch");
const bulkStart = el("bulkStart");
const bulkEnd = el("bulkEnd");
const bulkStatus = el("bulkStatus");
const bulkApplyBtn = el("bulkApplyBtn");
const bulkProgress = el("bulkProgress");

/* ----------------------------- State ----------------------------- */
let isAdmin = false;

let pitches = []; // [{id,name,hidden?}]
let slots = [];   // ["10:00", ...]
let dayCells = new Map(); // cellId -> data
let selectedDateId = "";  // YYYY-MM-DD

let selectedPitch = null; // {id,name,hidden?}
let selectedSlot = null;

let draftPitches = [];
let draftSlots = [];

/* -------------------------- Date helpers -------------------------- */
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

function* iterDatesInclusive(startIso, endIso) {
  const start = new Date(startIso + "T00:00:00");
  const end = new Date(endIso + "T00:00:00");
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    yield local.toISOString().slice(0, 10);
  }
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

/* -------------------------- Firestore helpers -------------------------- */
function cellIdFor(pitchId, slotStr) {
  const slotKey = slotStr.replaceAll(":", "");
  return `${pitchId}__${slotKey}`;
}

async function loadConfig() {
  const pitchesSnap = await getDoc(doc(db, "config", "pitches"));
  const slotsSnap = await getDoc(doc(db, "config", "timeslots"));

  const rawPitches = (pitchesSnap.exists() && Array.isArray(pitchesSnap.data().pitches))
    ? pitchesSnap.data().pitches
    : [];

  pitches = rawPitches.map(p => ({
    id: String(p.id),
    name: String(p.name),
    hidden: !!p.hidden
  }));

  slots = (slotsSnap.exists() && Array.isArray(slotsSnap.data().slots))
    ? slotsSnap.data().slots.map(String)
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

/* ------------------------------ Render ------------------------------ */
function renderTable() {
  const visiblePitches = isAdmin
    ? pitches
    : pitches.filter(p => !p.hidden);

  const thead = [];
  thead.push("<tr>");
  thead.push("<th>Time</th>");
  for (const p of visiblePitches) {
    const hiddenBadge = (isAdmin && p.hidden) ? `<span class="badge badge--hidden">Hidden</span>` : "";
    const thClass = (isAdmin && p.hidden) ? " class=\"pitch-hidden\"" : "";
    thead.push(`<th${thClass}>${escapeHtml(p.name)}${hiddenBadge}</th>`);
  }
  thead.push("</tr>");

  const tbody = [];
  for (const s of slots) {
    tbody.push("<tr>");
    tbody.push(`<td>${escapeHtml(s)}</td>`);

    for (const p of visiblePitches) {
      const id = cellIdFor(p.id, s);
      const data = dayCells.get(id) || null;

      const status = (data && data.status) ? data.status : "available";
      const notes = (data && data.notes) ? data.notes : "";

      const mainText = statusLabel(status);
      const notesHtml = notes
        ? `<div class="cell__notes" title="${escapeHtmlAttr(notes)}">${escapeHtml(notes)}</div>`
        : "";

      const clickable = isAdmin ? "cell--clickable" : "";
      const hiddenClass = (isAdmin && p.hidden) ? " pitch-hidden" : "";

      tbody.push(
        `<td>
          <div class="cell cell--${status} ${clickable}${hiddenClass}"
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

/* ------------------------------ Cell edit ------------------------------ */
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
  cellPitch.textContent = selectedPitch.name + (selectedPitch.hidden ? " (Hidden)" : "");
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
    // overwrite to avoid schema mismatch with strict rules
    await setDoc(doc(db, "schedule", selectedDateId, "cells", id), payload, { merge: false });
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

/* ------------------------------ Manage config ------------------------------ */
function openManage() {
  clearError(manageError);
  bulkProgress.textContent = "";

  draftPitches = structuredClone(pitches);
  draftSlots = structuredClone(slots);

  // set bulk date inputs to same constraints as main date picker
  bulkStart.min = dateInput.min;
  bulkStart.max = dateInput.max;
  bulkEnd.min = dateInput.min;
  bulkEnd.max = dateInput.max;

  bulkStart.value = selectedDateId;
  bulkEnd.value = selectedDateId;

  renderManageLists();
  renderBulkPitchOptions();

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
        <div class="listrow__title">
          ${escapeHtml(p.name)}
          ${p.hidden ? '<span class="badge badge--hidden">Hidden</span>' : ''}
        </div>
        <div class="listrow__meta">id: ${escapeHtml(p.id)}</div>
      </div>

      <div class="row">
        <label class="hint" style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" ${p.hidden ? "checked" : ""} />
          Hidden
        </label>
        <button class="btn btn--danger" type="button">Remove</button>
      </div>
    `;

    const hiddenCheckbox = row.querySelector("input[type='checkbox']");
    const removeBtn = row.querySelector("button.btn--danger");

    hiddenCheckbox.addEventListener("change", () => {
      const idx = draftPitches.findIndex(x => x.id === p.id);
      if (idx >= 0) draftPitches[idx].hidden = hiddenCheckbox.checked;
      renderManageLists();
      renderBulkPitchOptions();
    });

    removeBtn.addEventListener("click", () => {
      draftPitches = draftPitches.filter(x => x.id !== p.id);
      renderManageLists();
      renderBulkPitchOptions();
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

function renderBulkPitchOptions() {
  const current = bulkPitch.value;
  bulkPitch.innerHTML = "";

  for (const p of draftPitches) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name + (p.hidden ? " (Hidden)" : "");
    bulkPitch.appendChild(opt);
  }

  // keep selection if still present
  if (current && draftPitches.some(p => p.id === current)) {
    bulkPitch.value = current;
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

  draftPitches.push({ id, name, hidden: false });
  newPitchName.value = "";

  renderManageLists();
  renderBulkPitchOptions();
}

function addSlot() {
  clearError(manageError);

  const s = (newSlot.value || "").trim();
  if (!isValidTimeSlot(s)) {
    showError(manageError, "Timeslot must be HH:MM (24-hour), e.g. 09:00 or 21:30.");
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
    await refresh();
    setStatus("Configuration updated.");
  } catch (e) {
    showError(manageError, `Save failed: ${friendlyError(e)}`);
  }
}

/* ------------------------------ Bulk Apply ------------------------------ */
async function bulkApply() {
  clearError(manageError);
  bulkProgress.textContent = "";

  if (!auth.currentUser) {
    showError(manageError, "Not authenticated.");
    return;
  }
  if (draftPitches.length === 0 || draftSlots.length === 0) {
    showError(manageError, "You must have at least one pitch and one timeslot.");
    return;
  }

  const pitchId = bulkPitch.value;
  const start = bulkStart.value;
  const end = bulkEnd.value;
  const status = bulkStatus.value;

  if (!pitchId) {
    showError(manageError, "Select a pitch.");
    return;
  }
  if (!start || !end) {
    showError(manageError, "Select a start and end date.");
    return;
  }
  if (start > end) {
    showError(manageError, "Start date must be on or before end date.");
    return;
  }

  // enforce same bounds as main date picker (today -> +365)
  if (start < dateInput.min || end > dateInput.max) {
    showError(manageError, `Date range must be within ${dateInput.min} → ${dateInput.max}.`);
    return;
  }

  const pitchExists = draftPitches.some(p => p.id === pitchId);
  if (!pitchExists) {
    showError(manageError, "Selected pitch no longer exists.");
    return;
  }

  bulkApplyBtn.disabled = true;

  try {
    const dates = Array.from(iterDatesInclusive(start, end));
    const totalOps = dates.length * draftSlots.length;

    let done = 0;
    let batch = writeBatch(db);
    let batchCount = 0;

    // keep batches below limit (500 writes). use 450 for headroom
    const MAX_BATCH = 450;

    for (const dateId of dates) {
      for (const slot of draftSlots) {
        const id = cellIdFor(pitchId, slot);
        const ref = doc(db, "schedule", dateId, "cells", id);

        if (status === "available") {
          // default is available => delete any existing overrides
          batch.delete(ref);
        } else {
          batch.set(ref, {
            status,
            notes: "",
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser.uid
          }, { merge: false });
        }

        batchCount++;
        done++;

        if (batchCount >= MAX_BATCH) {
          bulkProgress.textContent = `Applying… ${done}/${totalOps}`;
          await batch.commit();
          batch = writeBatch(db);
          batchCount = 0;
        }
      }
    }

    if (batchCount > 0) {
      bulkProgress.textContent = `Applying… ${done}/${totalOps}`;
      await batch.commit();
    }

    bulkProgress.textContent = `Complete. Applied ${statusLabel(status).toLowerCase()} for ${dates.length} day(s), all timeslots.`;

    // If the current selected day is within the range, refresh it so UI updates immediately
    if (selectedDateId >= start && selectedDateId <= end) {
      await loadDay(selectedDateId);
      renderTable();
    }
  } catch (e) {
    showError(manageError, `Bulk apply failed: ${friendlyError(e)}`);
  } finally {
    bulkApplyBtn.disabled = false;
  }
}

/* ------------------------------ Auth + Modals ------------------------------ */
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

bulkApplyBtn.addEventListener("click", bulkApply);

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

/* ------------------------------ Init ------------------------------ */
function initDatePicker() {
  const min = todayISO();
  const max = addDaysISO(min, 365);

  dateInput.min = min;
  dateInput.max = max;

  selectedDateId = min;
  dateInput.value = selectedDateId;

  if (dateHint) dateHint.textContent = `Allowed range: ${min} → ${max}`;


  dateInput.addEventListener("change", async () => {
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
    statusBar.textContent = `Load failed: ${friendlyError(e)}`;
  }
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
