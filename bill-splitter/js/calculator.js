(() => {
  function roundUp(value, nearest) {
    const step = Number(nearest) || 0;
    if (step <= 0) return Math.round(value);
    return Math.ceil(value / step) * step;
  }

  function calculateSplit(session, settings = {}) {
    const people = Array.isArray(session.people) ? session.people : [];
    const items = Array.isArray(session.items) ? session.items : [];
    const taxPct = Number(session.taxPct) || 0;
    const servicePct = Number(session.servicePct) || 0;
    const roundUpToNearest = Number(settings.roundUpToNearest) || 0;

    const personMap = new Map(
      people.map((person) => [
        person.id,
        {
          personId: person.id,
          name: person.name,
          subtotal: 0,
          tax: 0,
          service: 0,
          total: 0,
          totalRounded: 0,
          items: [],
        },
      ]),
    );

    let subtotal = 0;

    items.forEach((item) => {
      const price = Number(item.price) || 0;
      const sharedBy = Array.isArray(item.sharedBy) ? item.sharedBy.filter((id) => personMap.has(id)) : [];
      if (price <= 0 || sharedBy.length === 0) return;

      subtotal += price;
      const shareAmount = price / sharedBy.length;

      sharedBy.forEach((personId) => {
        const person = personMap.get(personId);
        person.subtotal += shareAmount;
        person.items.push({
          itemId: item.id,
          name: item.name,
          price,
          sharedCount: sharedBy.length,
          shareAmount,
        });
      });
    });

    const tax = subtotal * (taxPct / 100);
    const service = subtotal * (servicePct / 100);
    const grandTotal = subtotal + tax + service;
    const perPerson = Array.from(personMap.values()).map((person) => {
      person.tax = person.subtotal * (taxPct / 100);
      person.service = person.subtotal * (servicePct / 100);
      person.total = person.subtotal + person.tax + person.service;
      person.totalRounded = roundUp(person.total, roundUpToNearest);
      return person;
    });

    const grandTotalRounded = perPerson.reduce((sum, person) => sum + person.totalRounded, 0);
    const personRawTotal = perPerson.reduce((sum, person) => sum + person.total, 0);

    return {
      perPerson,
      subtotal,
      tax,
      service,
      grandTotal,
      grandTotalRounded,
      personRawTotal,
      isBalanced: Math.abs(personRawTotal - grandTotal) <= 1,
    };
  }

  window.BillCalculator = {
    calculateSplit,
  };
})();
