(() => {
  async function scanReceipt() {
    throw new Error("OCR struk belum tersedia di Phase 1.");
  }

  window.BillOcr = {
    scanReceipt,
  };
})();
