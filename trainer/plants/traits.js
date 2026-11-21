export function seededRandom(seed) {
  return () => {
    seed=(seed+0x6d2b79f5)>>>0;
    let a=Math.imul(seed^(seed>>>15),1|seed);
    a^=a+Math.imul(a^(a>>>7),61|a);
    return ((a^(a>>>14))>>>0)/4294967296;
  };
}

// Organ complexity must never move a neighbor or change its assigned form.
export function plantTraits(seed, ordinal, forms, form, condition) {
  const organSeed = seed ^ Math.imul(ordinal, 0x9e3779b9);
  const choice = seededRandom(organSeed ^ 0x132823f1);
  return {
    form: form === 'mixed' ? forms[Math.floor(choice()*forms.length)].id : form,
    damaged: condition === 'mixed' ? seededRandom(organSeed ^ 0x57ab342d)() < .25 : condition === 'damaged',
    random: seededRandom(organSeed)
  };
}
