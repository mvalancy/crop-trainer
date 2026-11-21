export const MAX_SAMPLE_LIMIT = 48_000;

export function validSampleLimit(value) {
  return Number.isInteger(value) && value >= 24 && value <= MAX_SAMPLE_LIMIT && value % 2 === 0;
}

// Each labeled plant in a training tile points to the count shared by its form and soil setting.
export function formSoilGroup(groups, plantForm, ground) {
  const key = plantForm + ':' + ground;
  if (!groups.has(key)) {
    groups.set(key, {plantForm, ground, available: 0, selected: 0});
  }
  return groups.get(key);
}

export function balanceFormSoil(shuffledRows, count) {
  if (count === shuffledRows.length) return shuffledRows;

  // Take one place per represented group each round. The seeded shuffle decides
  // which group gets a remainder. An exhausted group gives up its next place.
  const quotas = new Map();
  for (const [, , group] of shuffledRows) quotas.set(group, 0);
  let remaining = count;
  while (remaining > 0) {
    for (const [group, quota] of quotas) {
      if (quota === group.available) continue;
      quotas.set(group, quota + 1);
      if (--remaining === 0) break;
    }
  }

  // Keep the original shuffled order among selected rows. This also preserves
  // the ordering of batches when the ordinary draw already fills each quota.
  const chosen = [];
  for (const row of shuffledRows) {
    const group = row[2], left = quotas.get(group);
    if (left > 0) {
      chosen.push(row);
      quotas.set(group, left - 1);
      if (chosen.length === count) break;
    }
  }
  return chosen;
}
