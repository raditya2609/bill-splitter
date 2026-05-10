(() => {
  const { formatDate, formatIDR, normalizePhone } = window.BillFormat;

  function buildShareText(session, calculation) {
    const longestName = calculation.perPerson.reduce((max, person) => Math.max(max, person.name.length), 0);
    const lines = [
      `Bagi Bill — ${session.title} (${formatDate(session.date)})`,
      "",
      ...calculation.perPerson.map((person) => `${`${person.name}:`.padEnd(longestName + 2)}${formatIDR(person.totalRounded)}`),
      "",
      `Total: ${formatIDR(calculation.grandTotalRounded)}`,
    ];

    if (session.notes) {
      lines.push("", `Catatan: ${session.notes}`);
    }

    return lines.join("\n");
  }

  async function shareSessionResult(session, calculation) {
    const text = buildShareText(session, calculation);
    const shareData = {
      title: `Bagi Bill - ${session.title}`,
      text,
    };

    if (navigator.share && navigator.canShare?.(shareData) !== false) {
      await navigator.share(shareData);
      return "shared";
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return "copied";
    }

    return "unsupported";
  }

  function buildPersonWhatsappMessage(session, person) {
    const lines = [
      `Hai ${person.name}! Bagi bill ${session.title} (${formatDate(session.date)}).`,
      "",
      "Item kamu:",
      ...person.items.map((item) => {
        const sharingNote = item.sharedCount > 1 ? ` (split ${item.sharedCount})` : "";
        return `- ${item.name}: ${formatIDR(item.shareAmount)}${sharingNote}`;
      }),
      "",
      `Sub: ${formatIDR(person.subtotal)}`,
    ];

    if ((Number(session.taxPct) || 0) > 0) {
      lines.push(`Pajak ${Number(session.taxPct)}%: ${formatIDR(person.tax)}`);
    }

    if ((Number(session.servicePct) || 0) > 0) {
      lines.push(`Service ${Number(session.servicePct)}%: ${formatIDR(person.service)}`);
    }

    lines.push(`Total: ${formatIDR(person.totalRounded)}`, "", "Bisa transfer kapan ya? Thanks!");
    return lines.join("\n");
  }

  function buildPersonWhatsappUrl(session, person, rawPhone) {
    const phone = normalizePhone(rawPhone);
    if (!phone) return null;
    const message = buildPersonWhatsappMessage(session, person);
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }

  window.BillShare = {
    buildShareText,
    buildPersonWhatsappMessage,
    buildPersonWhatsappUrl,
    shareSessionResult,
  };
})();
