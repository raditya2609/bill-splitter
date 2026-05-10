(() => {
  const STORAGE_KEY = "billsplitter:v1";

  const DEFAULT_STATE = {
    settings: {
      defaultTaxPct: 11,
      defaultServicePct: 5,
      currency: "IDR",
      roundUpToNearest: 1000,
    },
    sessions: [],
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeState(state) {
    return {
      settings: { ...DEFAULT_STATE.settings, ...(state?.settings || {}) },
      sessions: Array.isArray(state?.sessions) ? state.sessions.map(normalizeSession) : [],
    };
  }

  function normalizeSession(session) {
    return {
      ...session,
      people: Array.isArray(session.people) ? session.people.map(normalizePerson) : [],
    };
  }

  function normalizePerson(person) {
    return {
      ...person,
      phone: typeof person.phone === "string" ? person.phone : "",
      paidAt: typeof person.paidAt === "string" ? person.paidAt : null,
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return clone(DEFAULT_STATE);
      return normalizeState(JSON.parse(raw));
    } catch (error) {
      console.warn("Gagal membaca data lokal:", error);
      return clone(DEFAULT_STATE);
    }
  }

  function saveState(state) {
    const normalized = normalizeState(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function getSession(id) {
    return loadState().sessions.find((session) => session.id === id) || null;
  }

  function upsertSession(session) {
    const state = loadState();
    const index = state.sessions.findIndex((item) => item.id === session.id);
    const nextSession = { ...session, updatedAt: Date.now() };

    if (index >= 0) {
      state.sessions[index] = nextSession;
    } else {
      state.sessions.push(nextSession);
    }

    state.sessions.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    saveState(state);
    return nextSession;
  }

  function deleteSession(id) {
    const state = loadState();
    state.sessions = state.sessions.filter((session) => session.id !== id);
    saveState(state);
  }

  function saveSettings(settings) {
    const state = loadState();
    state.settings = { ...state.settings, ...settings };
    saveState(state);
    return state.settings;
  }

  window.BillStorage = {
    STORAGE_KEY,
    DEFAULT_STATE,
    loadState,
    saveState,
    getSession,
    upsertSession,
    deleteSession,
    saveSettings,
  };
})();
