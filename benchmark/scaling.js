// Each name identifies both the training rows and the training sample that supplied the scale.
export const scaleDraws = ['ordinary', 'distance-matched'];
const names = new Map([['ordinary', 'Shuffled'], ['distance-matched', 'Difficult']]);

export function scalingLabel({negativeSampling, scaleSource}) {
  return names.get(negativeSampling)+' rows · '+names.get(scaleSource).toLowerCase()+' scale';
}

export function showScalingResults(report, download) {
  const panel = document.getElementById('scalingReview');
  const choice = document.getElementById('scalingSeed');
  const grid = document.getElementById('scalingGrid');
  const seeds = [...new Set(report.rows.map(row => row.seed))];
  choice.replaceChildren(...seeds.map(seed => new Option(String(seed), String(seed))));

  function render() {
    const rows = report.rows.filter(row => row.seed === Number(choice.value));
    grid.replaceChildren();
    for (const draw of scaleDraws) {
      const section = document.createElement('section'), heading = document.createElement('h4');
      heading.textContent = names.get(draw)+' background examples';
      const cards = document.createElement('div');
      cards.className = 'scalingCards';
      for (const source of scaleDraws) {
        const row = rows.find(r => r.negativeSampling === draw && r.scaleSource === source);
        const score = row.byGround.find(g => g.ground).scores.find(s => s.cm === 15);
        const card = document.createElement('div'), title = document.createElement('strong');
        const found = document.createElement('p'), bar = document.createElement('div'), extras = document.createElement('p');
        title.textContent = names.get(source)+' scale';
        found.textContent = score.tp.toLocaleString()+' found';
        found.dataset.help = 'Planted centers with a pin within 15 cm, across the three soil-present test scans.';
        bar.className = 'scalingBar';
        bar.setAttribute('aria-hidden','true');
        bar.style.setProperty('--found', (100*score.recall)+'%');
        extras.textContent = score.fn.toLocaleString()+' missed · '+score.fp.toLocaleString()+' extra';
        extras.dataset.help = 'Missed plants received no matching pin. Extra pins have no matching plant at this distance.';
        const save = document.createElement('button');
        save.type = 'button';
        save.textContent = 'Save weights';
        save.setAttribute('aria-label','Save weights for '+scalingLabel(row)+' on seed '+row.seed);
        save.dataset.help = 'Download this detector with the exact feature scale and cutoff it used on these plots.';
        save.onclick = () => download(row.weightArtifact, 'crop-weights-'+report.settings.crop+'-'+draw+'-rows-'+source+'-scale-'+row.seed+'.json');
        card.append(title, found, bar, extras, save);
        cards.append(card);
      }
      section.append(heading, cards);
      grid.append(section);
    }
    const difficult = rows.find(row => row.negativeSampling === 'distance-matched');
    const {bands, selected, hardCount, pilotMs, pilotScoringMs, rankingMs, rebuildMs} = difficult.backgroundSelection;
    const duration = ms => ms < 1000 ? ms.toFixed(1)+' ms' : (ms/1000).toFixed(2)+' s';
    document.getElementById('scalingCost').textContent = 'The CPU practice fit took '+duration(pilotMs)+'. Rebuilding the difficult sample took '+
      duration(rebuildMs)+', including '+duration(pilotScoringMs)+' to score the background pool and '+duration(rankingMs)+' to choose the rows.';
    const adapter = difficult.adapter;
    document.getElementById('scalingBackend').textContent = 'Final fits used '+difficult.backend+
      (adapter ? ' · '+[adapter.kind, adapter.description || adapter.architecture].filter(Boolean).join(' · ') : '')+'.';
    document.getElementById('scalingQuota').textContent = 'Each fit saw '+selected.toLocaleString()+' crop examples and '+selected.toLocaleString()+
      ' backgrounds. Both draws kept '+bands.selectedNear.toLocaleString()+' backgrounds closer than 30 cm to a planted center and '+
      bands.selectedFar.toLocaleString()+' at least that far away. The difficult draw reserved '+hardCount.toLocaleString()+' places for high-scoring peaks.';
  }
  choice.onchange = render;
  render();
  panel.hidden = false;
}
