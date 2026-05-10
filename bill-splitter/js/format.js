(() => {
  const idrFormatter = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  });

  const plainNumberFormatter = new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0,
  });

  function formatIDR(value) {
    return idrFormatter.format(Math.round(Number(value) || 0)).replace(/\s/g, " ");
  }

  function formatNumber(value) {
    return plainNumberFormatter.format(Math.round(Number(value) || 0));
  }

  function parseIDR(value) {
    if (typeof value === "number") return value;
    const normalized = String(value || "").replace(/[^\d-]/g, "");
    return Number.parseInt(normalized, 10) || 0;
  }

  function formatDate(dateString) {
    if (!dateString) return "";
    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date);
  }

  function todayISO() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
  }

  function normalizePhone(raw) {
    let digits = String(raw || "").replace(/\D/g, "");
    if (digits.startsWith("0")) {
      digits = `62${digits.slice(1)}`;
    } else if (digits.startsWith("62")) {
      digits = digits;
    } else if (digits.length >= 10) {
      digits = `62${digits}`;
    }

    return digits.length >= 10 && digits.length <= 15 ? digits : null;
  }

  window.BillFormat = {
    formatIDR,
    formatNumber,
    parseIDR,
    formatDate,
    normalizePhone,
    todayISO,
  };
})();
