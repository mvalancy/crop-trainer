// Indices refer to the trainer's seeded shuffle. Preserve that order in the final fit.
export function selectHardNegatives(scores,count,hardCount) {
  if (!Number.isInteger(count) || count<1 || count>scores.length ||
      !Number.isInteger(hardCount) || hardCount<0 || hardCount>count ||
      !scores.every(Number.isFinite)) {
    throw new RangeError('Choose a valid number of hard examples from finite background scores.');
  }
  const order=Array.from(scores.keys());
  if (!hardCount) return order.slice(0,count);
  order.sort((a,b)=>scores[b]-scores[a] || a-b);
  const selected=new Set(order.slice(0,hardCount));
  for (let i=0;selected.size<count;i++) selected.add(i);
  return [...selected].sort((a,b)=>a-b);
}
