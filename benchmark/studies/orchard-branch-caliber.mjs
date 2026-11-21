// Compare primary-branch diameter spread within each intact, dormant v3 apple portrait.
import {makeRecipe} from '../../trainer/models/data.js';
import {measureOrchard,stationM} from './orchard-measurements.mjs';

const seeds = [9180011,9291127,9402239,9513359,9624469,9735581,9846691,9957793];
const trees=[];
for (const seed of seeds) {
  for (const form of ['central-leader','open-vase']) {
    const recipe=makeRecipe(seed,true,null,'apple',3,form,'healthy');
    const [{baseXY,...firstTree}]=measureOrchard(recipe,{firstOnly:true});
    trees.push(firstTree);
  }
}
console.log(JSON.stringify({domain:'synthetic',measurement:'primary branch circular cross section',
  stationM,seeds,trees},null,2));
