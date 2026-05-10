const { calculateSplit } = window.BillCalculator;
const { formatDate, formatIDR, formatNumber, normalizePhone, parseIDR, todayISO } = window.BillFormat;
const { deleteSession, getSession, loadState, saveSettings, saveState, upsertSession } = window.BillStorage;
const { buildPersonWhatsappUrl, shareSessionResult } = window.BillShare;

const app = document.querySelector("#app");
let draft = null;
let expandedPeople = new Set();
let deferredInstallPrompt = null;

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function navigate(hash) {
  window.location.hash = hash;
}

function routeParts() {
  const hash = window.location.hash || "#home";
  return hash.slice(1).split("/").filter(Boolean);
}

function hasContactsPicker() {
  return Boolean(navigator.contacts && navigator.contacts.select);
}

function render() {
  const parts = routeParts();

  if (parts[0] === "new") {
    renderSessionForm();
    return;
  }

  if (parts[0] === "settings") {
    renderSettings();
    return;
  }

  if (parts[0] === "session" && parts[1] && parts[2] === "edit") {
    renderSessionForm(parts[1]);
    return;
  }

  if (parts[0] === "session" && parts[1]) {
    renderSessionDetail(parts[1]);
    return;
  }

  renderHome();
}

function renderShell(content, options = {}) {
  app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn ${options.back ? "" : "is-hidden"}" data-action="back" aria-label="Kembali">‹</button>
      <a class="brand" href="#home">Bagi Bill</a>
      <a class="icon-btn" href="#settings" aria-label="Pengaturan">⚙</a>
    </header>
    <main class="view">${content}</main>
  `;
}

function renderHome() {
  const state = loadState();
  const sessions = [...state.sessions].sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

  renderShell(`
    <section class="hero-band">
      <p class="eyebrow">Split patungan tanpa login</p>
      <h1>Hitung bagian temanmu dengan rapi.</h1>
    </section>
    <section class="stack">
      ${
        sessions.length
          ? sessions
              .map((session) => {
                const calc = calculateSplit(session, state.settings);
                return `
                  <a class="session-card" href="#session/${session.id}">
                    <span>
                      <strong>${escapeHtml(session.title)}</strong>
                      <small>${formatDate(session.date)} · ${session.people.length} orang</small>
                    </span>
                    <b>${formatIDR(calc.grandTotalRounded)}</b>
                  </a>
                `;
              })
              .join("")
          : `
            <div class="empty-state">
              <div class="empty-icon">+</div>
              <h2>Belum ada split.</h2>
              <p>Mulai yang pertama dan semua data akan tersimpan di perangkat ini.</p>
            </div>
          `
      }
    </section>
    <nav class="bottom-bar">
      <a class="primary-btn" href="#new">+ Split Baru</a>
    </nav>
  `);
}

function createBlankDraft(settings) {
  return {
    id: makeId("s"),
    title: "",
    date: todayISO(),
    createdAt: Date.now(),
    people: [],
    items: [],
    taxPct: settings.defaultTaxPct,
    servicePct: settings.defaultServicePct,
    notes: "",
  };
}

function cloneSession(session) {
  return JSON.parse(JSON.stringify(session));
}

function ensureDraft(sessionId) {
  const state = loadState();
  if (sessionId) {
    const session = getSession(sessionId);
    if (!session) return null;
    if (!draft || draft.id !== sessionId) draft = cloneSession(session);
  } else if (!draft || getSession(draft.id)) {
    draft = createBlankDraft(state.settings);
  }
  return draft;
}

function renderSessionForm(sessionId = null, errors = []) {
  const state = loadState();
  const currentDraft = ensureDraft(sessionId);

  if (!currentDraft) {
    renderNotFound();
    return;
  }

  const calc = calculateSplit(currentDraft, state.settings);
  const title = sessionId ? "Edit Split" : "Split Baru";

  renderShell(
    `
      <form class="form" data-form="session">
        <section class="section-block">
          <h1>${title}</h1>
          ${renderErrors(errors)}
          <label>
            <span>Judul</span>
            <input name="title" type="text" value="${escapeHtml(currentDraft.title)}" placeholder="Mis. Makan malam Sushi Tei" required>
          </label>
          <label>
            <span>Tanggal</span>
            <input name="date" type="date" value="${escapeHtml(currentDraft.date)}" required>
          </label>
        </section>

        <section class="section-block">
          <h2>Orang</h2>
          <div class="person-row-list">
            ${
              currentDraft.people.length
                ? currentDraft.people.map((person) => renderPersonFormRow(person)).join("")
                : `<p class="hint">Tambahkan minimal satu orang sebelum membuat item.</p>`
            }
          </div>
          <button type="button" class="secondary-btn wide" data-action="add-person">+ Tambah orang</button>
        </section>

        <section class="section-block">
          <div class="section-title-row">
            <h2>Item</h2>
            <button type="button" class="ghost-btn" data-action="scan-placeholder">📷 Scan struk</button>
          </div>
          <div class="item-list">
            ${
              currentDraft.items.length
                ? currentDraft.items.map((item) => renderItemRow(item, currentDraft.people)).join("")
                : `<p class="hint">Belum ada item. Tambahkan makanan, minuman, atau biaya bersama.</p>`
            }
          </div>
          <button type="button" class="secondary-btn wide" data-action="add-item">+ Tambah item</button>
        </section>

        <section class="section-block two-col">
          <label>
            <span>Pajak (%)</span>
            <input name="taxPct" type="number" min="0" step="0.1" value="${escapeHtml(currentDraft.taxPct)}">
          </label>
          <label>
            <span>Service (%)</span>
            <input name="servicePct" type="number" min="0" step="0.1" value="${escapeHtml(currentDraft.servicePct)}">
          </label>
          <label class="full-span">
            <span>Catatan</span>
            <textarea name="notes" rows="3" placeholder="Opsional">${escapeHtml(currentDraft.notes)}</textarea>
          </label>
        </section>

        <div class="sticky-total">
          <span>
            <small>Total</small>
            <strong data-live-total>${formatIDR(calc.grandTotalRounded)}</strong>
          </span>
          <button class="primary-btn" type="submit">Hitung & Simpan</button>
        </div>
      </form>
      <p class="toast" data-toast hidden></p>
    `,
    { back: true },
  );
}

function renderPersonFormRow(person) {
  const contactButton = hasContactsPicker()
    ? `<button type="button" class="secondary-btn" data-action="pick-contact" data-person-id="${person.id}">Pilih dari kontak</button>`
    : "";

  return `
    <article class="person-form-row" data-person-row-id="${person.id}">
      <label>
        <span>Nama</span>
        <input data-field="person-name" type="text" value="${escapeHtml(person.name)}" placeholder="Nama teman" required>
      </label>
      <label>
        <span>Nomor WhatsApp · opsional</span>
        <input data-field="person-phone" type="tel" inputmode="tel" value="${escapeHtml(person.phone || "")}" placeholder="08123456789">
      </label>
      <div class="person-row-actions">
        ${contactButton}
        <button type="button" class="secondary-btn danger-text" data-action="remove-person" data-person-id="${person.id}">Hapus</button>
      </div>
    </article>
  `;
}

function renderItemRow(item, people) {
  return `
    <article class="item-row" data-item-id="${item.id}">
      <div class="item-row-head">
        <label>
          <span>Nama item</span>
          <input data-field="item-name" type="text" value="${escapeHtml(item.name)}" placeholder="Mis. Nasi goreng">
        </label>
        <button type="button" class="icon-btn danger" data-action="remove-item" data-item-id="${item.id}" aria-label="Hapus item">🗑</button>
      </div>
      <label>
        <span>Harga</span>
        <input data-field="item-price" type="text" inputmode="numeric" value="${item.price ? `Rp ${formatNumber(item.price)}` : ""}" placeholder="Rp 0">
      </label>
      <div>
        <span class="field-label">Patungan oleh</span>
        <div class="chip-list">
          ${
            people.length
              ? people
                  .map(
                    (person) => `
                      <button type="button" class="chip toggle ${item.sharedBy.includes(person.id) ? "is-active" : ""}" data-action="toggle-share" data-item-id="${item.id}" data-person-id="${person.id}">
                        ${escapeHtml(person.name || "Tanpa nama")}
                      </button>
                    `,
                  )
                  .join("")
              : `<p class="hint">Tambahkan orang dulu.</p>`
          }
        </div>
      </div>
    </article>
  `;
}

function renderErrors(errors) {
  if (!errors.length) return "";
  return `
    <div class="error-box" role="alert">
      ${errors.map((error) => `<p>${escapeHtml(error)}</p>`).join("")}
    </div>
  `;
}

function syncDraftFromForm() {
  const form = app.querySelector("[data-form='session']");
  if (!form || !draft) return;

  draft.title = form.elements.title.value.trim();
  draft.date = form.elements.date.value;
  draft.taxPct = Number(form.elements.taxPct.value) || 0;
  draft.servicePct = Number(form.elements.servicePct.value) || 0;
  draft.notes = form.elements.notes.value.trim();

  app.querySelectorAll("[data-person-row-id]").forEach((row) => {
    const person = draft.people.find((entry) => entry.id === row.dataset.personRowId);
    if (!person) return;
    person.name = row.querySelector("[data-field='person-name']").value.trim();
    person.phone = row.querySelector("[data-field='person-phone']").value.trim();
    person.paidAt = person.paidAt || null;
  });

  app.querySelectorAll("[data-item-id].item-row").forEach((row) => {
    const item = draft.items.find((entry) => entry.id === row.dataset.itemId);
    if (!item) return;
    item.name = row.querySelector("[data-field='item-name']").value.trim();
    item.price = parseIDR(row.querySelector("[data-field='item-price']").value);
  });
}

function updateLiveTotal() {
  syncDraftFromForm();
  const total = app.querySelector("[data-live-total]");
  if (total && draft) {
    total.textContent = formatIDR(calculateSplit(draft, loadState().settings).grandTotalRounded);
  }
}

function addPerson() {
  if (!draft) return;

  const person = { id: makeId("p"), name: "", phone: "", paidAt: null };
  draft.people.push(person);
  draft.items.forEach((item) => {
    if (item.sharedBy.length === 0) item.sharedBy.push(person.id);
  });
  renderSessionForm(getSession(draft.id) ? draft.id : null);
}

function removePerson(personId) {
  if (!draft) return;
  draft.people = draft.people.filter((person) => person.id !== personId);
  draft.items = draft.items.map((item) => ({
    ...item,
    sharedBy: item.sharedBy.filter((id) => id !== personId),
  }));
  renderSessionForm(getSession(draft.id) ? draft.id : null);
}

function addItem() {
  if (!draft) return;
  draft.items.push({
    id: makeId("i"),
    name: "",
    price: 0,
    sharedBy: draft.people.map((person) => person.id),
  });
  renderSessionForm(getSession(draft.id) ? draft.id : null);
}

function removeItem(itemId) {
  if (!draft) return;
  draft.items = draft.items.filter((item) => item.id !== itemId);
  renderSessionForm(getSession(draft.id) ? draft.id : null);
}

function toggleShare(itemId, personId) {
  if (!draft) return;
  const item = draft.items.find((entry) => entry.id === itemId);
  if (!item) return;

  if (item.sharedBy.includes(personId)) {
    item.sharedBy = item.sharedBy.filter((id) => id !== personId);
  } else {
    item.sharedBy.push(personId);
  }

  renderSessionForm(getSession(draft.id) ? draft.id : null);
}

function validateDraft() {
  const errors = [];
  if (!draft.title.trim()) errors.push("Judul wajib diisi.");
  if (!draft.date) errors.push("Tanggal wajib diisi.");
  const namedPeople = draft.people.filter((person) => person.name.trim());
  if (namedPeople.length < 1) errors.push("Tambahkan minimal satu orang dengan nama.");
  draft.people.forEach((person, index) => {
    if (!person.name.trim()) errors.push(`Orang ${index + 1}: nama wajib diisi.`);
  });
  if (draft.items.length < 1) errors.push("Tambahkan minimal satu item.");

  draft.items.forEach((item, index) => {
    const label = item.name || `Item ${index + 1}`;
    if (!item.name.trim()) errors.push(`${label}: nama item wajib diisi.`);
    if ((Number(item.price) || 0) <= 0) errors.push(`${label}: harga harus lebih dari 0.`);
    if (!item.sharedBy.length) errors.push(`${label}: pilih minimal satu orang yang patungan.`);
  });

  return errors;
}

function saveDraft() {
  syncDraftFromForm();
  const errors = validateDraft();
  if (errors.length) {
    renderSessionForm(getSession(draft.id) ? draft.id : null, errors);
    return;
  }

  const saved = upsertSession(draft);
  draft = null;
  navigate(`#session/${saved.id}`);
}

function renderSessionDetail(sessionId) {
  const state = loadState();
  const session = getSession(sessionId);
  if (!session) {
    renderNotFound();
    return;
  }

  const calc = calculateSplit(session, state.settings);
  const payment = getPaymentSummary(session, calc);
  renderShell(
    `
      <section class="detail-head">
        <span>
          <p class="eyebrow">${formatDate(session.date)}</p>
          <h1>${escapeHtml(session.title)}</h1>
        </span>
        <div class="action-row compact">
          <a class="icon-btn" href="#session/${session.id}/edit" aria-label="Edit">✎</a>
          <button class="icon-btn danger" data-action="delete-session" data-session-id="${session.id}" aria-label="Hapus">🗑</button>
        </div>
      </section>

      <p class="payment-summary">${payment.paidCount} dari ${payment.totalCount} sudah bayar · ${formatIDR(payment.paidAmount)} dari ${formatIDR(calc.grandTotalRounded)}</p>

      <section class="stack">
        ${calc.perPerson.map((person) => renderPersonCard(session, person)).join("")}
      </section>

      <section class="summary-band">
        <div><span>Subtotal</span><strong>${formatIDR(calc.subtotal)}</strong></div>
        <div><span>Pajak</span><strong>${formatIDR(calc.tax)}</strong></div>
        <div><span>Service</span><strong>${formatIDR(calc.service)}</strong></div>
        <div class="grand"><span>Grand Total</span><strong>${formatIDR(calc.grandTotalRounded)}</strong></div>
      </section>

      <div class="action-row">
        <button class="primary-btn" data-action="share-session" data-session-id="${session.id}">Bagikan ke WhatsApp</button>
        <a class="secondary-btn" href="#session/${session.id}/edit">Edit</a>
        <button class="secondary-btn danger-text" data-action="delete-session" data-session-id="${session.id}">Hapus</button>
      </div>
      <p class="toast" data-toast hidden></p>
    `,
    { back: true },
  );
}

function getPaymentSummary(session, calculation) {
  const paidIds = new Set(session.people.filter((person) => person.paidAt).map((person) => person.id));
  return {
    paidCount: paidIds.size,
    totalCount: session.people.length,
    paidAmount: calculation.perPerson.reduce((sum, person) => (paidIds.has(person.personId) ? sum + person.totalRounded : sum), 0),
  };
}

function renderPersonCard(session, person) {
  const isOpen = expandedPeople.has(person.personId);
  const personRecord = session.people.find((entry) => entry.id === person.personId) || {};
  const phone = normalizePhone(personRecord.phone);
  const isPaid = Boolean(personRecord.paidAt);
  return `
    <article class="person-card ${isPaid ? "is-paid" : ""}">
      <button type="button" class="person-main" data-action="toggle-person" data-person-id="${person.personId}">
        <span>
          <strong>${isPaid ? `<span class="paid-check">✓</span> ` : ""}${escapeHtml(person.name)}</strong>
          <small>${person.items.length} item · sub ${formatIDR(person.subtotal)}</small>
        </span>
        <b>${formatIDR(person.totalRounded)}</b>
      </button>
      <div class="person-actions">
        <label class="paid-toggle">
          <input type="checkbox" data-action="toggle-paid" data-session-id="${session.id}" data-person-id="${person.personId}" ${isPaid ? "checked" : ""}>
          <span>Sudah bayar</span>
        </label>
        <button type="button" class="secondary-btn" data-action="request-whatsapp" data-session-id="${session.id}" data-person-id="${person.personId}" ${phone ? "" : "disabled"}>📨 Tagih via WhatsApp</button>
      </div>
      ${
        isOpen
          ? `
            <div class="breakdown">
              ${person.items
                .map(
                  (item) => `
                    <div>
                      <span>${escapeHtml(item.name)} <small>÷ ${item.sharedCount}</small></span>
                      <strong>${formatIDR(item.shareAmount)}</strong>
                    </div>
                  `,
                )
                .join("")}
              <div><span>Pajak</span><strong>${formatIDR(person.tax)}</strong></div>
              <div><span>Service</span><strong>${formatIDR(person.service)}</strong></div>
            </div>
          `
          : ""
      }
    </article>
  `;
}

function renderSettings() {
  const state = loadState();
  const settings = state.settings;
  const installSection = deferredInstallPrompt
    ? `
        <section class="section-block">
          <h2>Instal Aplikasi</h2>
          <button class="primary-btn" type="button" data-action="install-app">Pasang ke Home Screen</button>
        </section>
      `
    : "";

  renderShell(
    `
      <form class="form narrow" data-form="settings">
        <section class="section-block">
          <h1>Pengaturan</h1>
          <label>
            <span>Default pajak (%)</span>
            <input name="defaultTaxPct" type="number" min="0" step="0.1" value="${escapeHtml(settings.defaultTaxPct)}">
          </label>
          <label>
            <span>Default service (%)</span>
            <input name="defaultServicePct" type="number" min="0" step="0.1" value="${escapeHtml(settings.defaultServicePct)}">
          </label>
          <label>
            <span>Pembulatan</span>
            <select name="roundUpToNearest">
              ${[0, 100, 500, 1000]
                .map((value) => `<option value="${value}" ${Number(settings.roundUpToNearest) === value ? "selected" : ""}>${value === 0 ? "Mati" : formatIDR(value)}</option>`)
                .join("")}
            </select>
          </label>
          <button class="primary-btn" type="submit">Simpan Pengaturan</button>
        </section>

        <section class="section-block">
          <h2>Backup Data</h2>
          <p class="hint">Export membuat file JSON dari semua split di perangkat ini. Import akan mengganti data lokal dengan isi file backup.</p>
          <div class="utility-grid">
            <button class="secondary-btn" type="button" data-action="export-json">Export JSON</button>
            <button class="secondary-btn" type="button" data-action="choose-import">Import JSON</button>
          </div>
          <input class="file-input" type="file" accept="application/json,.json" data-import-file>
        </section>
        ${installSection}
      </form>
      <p class="toast" data-toast hidden></p>
    `,
    { back: true },
  );
}

function renderNotFound() {
  renderShell(
    `
      <section class="empty-state">
        <h1>Split tidak ditemukan</h1>
        <p>Data ini mungkin sudah dihapus dari perangkat.</p>
        <a class="primary-btn" href="#home">Kembali ke Beranda</a>
      </section>
    `,
    { back: true },
  );
}

function showToast(message) {
  const toast = app.querySelector("[data-toast]");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  setTimeout(() => {
    toast.hidden = true;
  }, 2600);
}

async function withBusyButton(button, label, task) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try {
    return await task();
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function exportJson(button) {
  withBusyButton(button, "Menyiapkan...", async () => {
    const state = loadState();
    const backup = {
      ...state,
      exportedAt: new Date().toISOString(),
      app: "billsplitter",
      version: 1,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bagi-bill-backup-${todayISO()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Backup JSON siap diunduh.");
  });
}

function chooseImportFile() {
  app.querySelector("[data-import-file]")?.click();
}

function validateImportedState(value) {
  if (!value || typeof value !== "object") throw new Error("File backup tidak valid.");
  if (!value.settings || typeof value.settings !== "object") throw new Error("Bagian pengaturan tidak ditemukan.");
  if (!Array.isArray(value.sessions)) throw new Error("Daftar split tidak ditemukan.");
  return {
    settings: value.settings,
    sessions: value.sessions,
  };
}

async function importJson(file) {
  if (!file) return;

  try {
    const text = await file.text();
    const nextState = validateImportedState(JSON.parse(text));
    if (!confirm("Import backup akan mengganti semua data lokal. Lanjutkan?")) return;
    saveState(nextState);
    draft = null;
    showToast("Backup berhasil diimport.");
    setTimeout(() => renderSettings(), 650);
  } catch (error) {
    showToast(error.message || "Gagal membaca file backup.");
  }
}

function setPersonPaid(sessionId, personId, paid) {
  const session = getSession(sessionId);
  if (!session) return;
  const person = session.people.find((entry) => entry.id === personId);
  if (!person) return;
  person.paidAt = paid ? new Date().toISOString() : null;
  upsertSession(session);
  renderSessionDetail(sessionId);
}

function openPersonWhatsapp(sessionId, personId) {
  const state = loadState();
  const session = getSession(sessionId);
  if (!session) return;
  const personRecord = session.people.find((entry) => entry.id === personId);
  if (!personRecord) return;
  const person = calculateSplit(session, state.settings).perPerson.find((entry) => entry.personId === personId);
  if (!person) return;
  const url = buildPersonWhatsappUrl(session, person, personRecord.phone);
  if (url) window.location.href = url;
}

async function pickContact(personId) {
  if (!hasContactsPicker() || !draft) return;

  try {
    const contacts = await navigator.contacts.select(["name", "tel"], { multiple: false });
    const contact = contacts?.[0];
    if (!contact) return;
    const person = draft.people.find((entry) => entry.id === personId);
    if (!person) return;
    person.name = contact.name?.[0] || person.name;
    person.phone = contact.tel?.[0] || person.phone;
    renderSessionForm(getSession(draft.id) ? draft.id : null);
  } catch (error) {
    // User cancellation and picker failures are intentionally silent.
  }
}

app.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;

  if (action === "back") {
    history.length > 1 ? history.back() : navigate("#home");
  }

  if (action === "add-person") {
    syncDraftFromForm();
    addPerson();
  }

  if (action === "remove-person") {
    syncDraftFromForm();
    removePerson(target.dataset.personId);
  }

  if (action === "pick-contact") {
    syncDraftFromForm();
    await pickContact(target.dataset.personId);
  }

  if (action === "add-item") {
    syncDraftFromForm();
    addItem();
  }

  if (action === "remove-item") {
    syncDraftFromForm();
    removeItem(target.dataset.itemId);
  }

  if (action === "toggle-share") {
    syncDraftFromForm();
    toggleShare(target.dataset.itemId, target.dataset.personId);
  }

  if (action === "scan-placeholder") {
    showToast("Scan struk akan tersedia di fase berikutnya.");
  }

  if (action === "toggle-person") {
    const id = target.dataset.personId;
    expandedPeople.has(id) ? expandedPeople.delete(id) : expandedPeople.add(id);
    const sessionId = routeParts()[1];
    renderSessionDetail(sessionId);
  }

  if (action === "delete-session") {
    const session = getSession(target.dataset.sessionId);
    if (!session) return;
    if (confirm(`Hapus split "${session.title}"?`)) {
      deleteSession(session.id);
      navigate("#home");
    }
  }

  if (action === "share-session") {
    const state = loadState();
    const session = getSession(target.dataset.sessionId);
    if (!session) return;
    try {
      const result = await withBusyButton(target, "Membagikan...", () => shareSessionResult(session, calculateSplit(session, state.settings)));
      if (result === "copied") showToast("Hasil disalin ke clipboard.");
      if (result === "unsupported") showToast("Browser belum mendukung share atau clipboard.");
    } catch (error) {
      if (error.name !== "AbortError") showToast("Gagal membagikan hasil.");
    }
  }

  if (action === "request-whatsapp") {
    openPersonWhatsapp(target.dataset.sessionId, target.dataset.personId);
  }

  if (action === "export-json") {
    exportJson(target);
  }

  if (action === "choose-import") {
    chooseImportFile();
  }

  if (action === "install-app" && deferredInstallPrompt) {
    await withBusyButton(target, "Membuka...", async () => {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      renderSettings();
    });
  }
});

app.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.matches("[name='personName']")) {
    event.preventDefault();
    syncDraftFromForm();
    addPerson();
  }
});

app.addEventListener("focusout", (event) => {
  if (event.target.matches("[data-field='item-price']")) {
    const value = parseIDR(event.target.value);
    event.target.value = value ? `Rp ${formatNumber(value)}` : "";
    updateLiveTotal();
  }
});

app.addEventListener("focusin", (event) => {
  if (event.target.matches("[data-field='item-price']")) {
    const value = parseIDR(event.target.value);
    event.target.value = value || "";
    event.target.select();
  }
});

app.addEventListener("input", (event) => {
  if (event.target.closest("[data-form='session']")) {
    updateLiveTotal();
  }
});

app.addEventListener("change", (event) => {
  if (event.target.matches("[data-action='toggle-paid']")) {
    setPersonPaid(event.target.dataset.sessionId, event.target.dataset.personId, event.target.checked);
  }

  if (event.target.matches("[data-import-file]")) {
    importJson(event.target.files?.[0]);
    event.target.value = "";
  }
});

app.addEventListener("submit", (event) => {
  event.preventDefault();

  if (event.target.matches("[data-form='session']")) {
    saveDraft();
  }

  if (event.target.matches("[data-form='settings']")) {
    const form = event.target;
    saveSettings({
      defaultTaxPct: Number(form.elements.defaultTaxPct.value) || 0,
      defaultServicePct: Number(form.elements.defaultServicePct.value) || 0,
      roundUpToNearest: Number(form.elements.roundUpToNearest.value) || 0,
    });
    showToast("Pengaturan disimpan.");
  }
});

window.addEventListener("hashchange", () => {
  draft = null;
  render();
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  if (routeParts()[0] === "settings") renderSettings();
});

if (!window.location.hash) {
  window.location.hash = "#home";
} else {
  render();
}

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Service worker gagal didaftarkan:", error);
    });
  });
}
