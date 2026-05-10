(() => {
  const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
  const PRICE_TOKEN_RE = /(?:Rp\s*)?([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{4,})(?:[.,]\d{2})?/i;
  let tesseractLoadPromise = null;

  function makeCandidateId() {
    return `ocr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function normalizeLine(line) {
    return String(line || "").trim().replace(/\s+/g, " ");
  }

  function parseMoney(value) {
    const text = String(value || "");
    const withoutDecimal = text.replace(/[.,]\d{2}$/, "");
    const digits = withoutDecimal.replace(/\D/g, "");
    return Number.parseInt(digits, 10) || 0;
  }

  function parsePercent(line) {
    const match = String(line || "").match(/(\d+(?:[.,]\d+)?)\s*%/);
    return match ? Number(match[1].replace(",", ".")) : null;
  }

  function classifyLine(line, priceMatch) {
    const lower = line.toLowerCase();
    const price = parseMoney(priceMatch[0]);
    const beforePrice = line.slice(0, priceMatch.index).trim().replace(/[-:]+$/, "").trim();
    const wordTokens = beforePrice.match(/[\p{L}\p{N}_]+/gu) || [];

    if (lower.includes("total") && !lower.includes("subtotal") && !lower.includes("sub total")) {
      return { type: "ignore", name: beforePrice || "Total", price, kind: "grand_total", percent: null };
    }

    if (lower.includes("subtotal") || lower.includes("sub total") || lower.includes("jumlah")) {
      return { type: "ignore", name: beforePrice || "Subtotal", price, kind: "subtotal", percent: null };
    }

    if (/\b(ppn|pajak|tax)\b/i.test(line)) {
      return { type: "tax", name: beforePrice || "Pajak", price, kind: "tax", percent: parsePercent(line) };
    }

    if (/\b(service|svc|srv|pelayanan)\b/i.test(line) || lower.includes("biaya layanan")) {
      return { type: "service", name: beforePrice || "Service", price, kind: "service", percent: parsePercent(line) };
    }

    if (wordTokens.length >= 2) {
      return { type: "item", name: beforePrice, price, kind: "item", percent: null };
    }

    return null;
  }

  function parseReceiptText(rawText) {
    const candidates = [];
    const lines = String(rawText || "")
      .split(/\r?\n/)
      .map(normalizeLine)
      .filter(Boolean);

    lines.forEach((line) => {
      const priceMatch = line.match(PRICE_TOKEN_RE);
      if (!priceMatch) return;

      const candidate = classifyLine(line, priceMatch);
      if (!candidate) return;

      candidates.push({
        id: makeCandidateId(),
        line,
        ...candidate,
      });
    });

    return {
      candidates,
      warning: buildSanityWarning(candidates),
    };
  }

  function buildSanityWarning(candidates) {
    const grandTotal = candidates.find((candidate) => candidate.kind === "grand_total")?.price || 0;
    if (!grandTotal) return "";

    const itemSum = candidates.filter((candidate) => candidate.type === "item").reduce((sum, candidate) => sum + candidate.price, 0);
    if (!itemSum) return "";

    const taxPct = candidates.find((candidate) => candidate.type === "tax" && candidate.percent !== null)?.percent || 0;
    const servicePct = candidates.find((candidate) => candidate.type === "service" && candidate.percent !== null)?.percent || 0;
    const expected = itemSum * (1 + taxPct / 100 + servicePct / 100);
    const diffRatio = Math.abs(expected - grandTotal) / grandTotal;

    return diffRatio > 0.05 ? "⚠ Total tidak cocok. Periksa item di bawah." : "";
  }

  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (tesseractLoadPromise) return tesseractLoadPromise;

    tesseractLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = TESSERACT_URL;
      script.async = true;
      script.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error("Tesseract tidak tersedia.")));
      script.onerror = () => {
        tesseractLoadPromise = null;
        reject(new Error("Gagal memuat OCR. Coba lagi atau input manual."));
      };
      document.head.append(script);
    });

    return tesseractLoadPromise;
  }

  async function recognizeImage(image, onProgress) {
    onProgress?.({ phase: "download", progress: 0, label: "Mengunduh model OCR (pertama kali aja)..." });
    const Tesseract = await loadTesseract();
    const logger = (event) => {
      const status = String(event.status || "").toLowerCase();
      const progress = Number(event.progress) || 0;
      const phase = status.includes("recognizing") ? "recognize" : "download";
      const label = phase === "recognize" ? "Memproses gambar..." : "Mengunduh model OCR (pertama kali aja)...";
      onProgress?.({ phase, progress, label });
    };

    try {
      const result = await Tesseract.recognize(image, "ind", { logger });
      return result?.data?.text || "";
    } catch (error) {
      const result = await Tesseract.recognize(image, "eng", { logger });
      return result?.data?.text || "";
    }
  }

  window.BillOcr = {
    parseReceiptText,
    recognizeImage,
    TESSERACT_URL,
  };
})();
