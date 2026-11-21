// Compare two peak maps on exactly the same ray returns. Soil labels are used
// only to create negative-control clouds after scoring the full XYZ plot.
import assert from 'node:assert/strict';
import {cpus} from 'node:os';
import {features,makeRecipe,detectionStages,matchCenters,targetCenters,MATCH_RADII_METERS} from '../../trainer/models/data.js';
import {field} from '../../trainer/generator/field.js';
import {getSensor} from '../../trainer/generator/sensors.js';
import {cropProfile} from '../../trainer/generator/crops.js';

const seedGroups={
  primary:[2731549,2842669,2953789,3064909,3176029,3287149],
  confirmation:[3398269,3509393,3620519,3731663]
};
const layouts=['reference','os1-64'];
const conditions=['clean','noisy-clutter'];
const gates=[.065,.035], modes=['zero-filled','occupied'];
const noise={xy:.8,z:.7,density:12,gaps:2,stray:.15,cluster:10};
const crop='tomato', form='seedling', architecture=2, points=60000;
const separation=cropProfile(crop).pinSeparation;
const rows=[],timingsMs={generation:0,prepareControls:0,features:{'zero-filled':0,occupied:0},matching:0};
function xyzSubset(scan,predicate){
  const xyz=new Float32Array(scan.xyz.length);
  let n=0;
  for(let i=0;i<scan.cls.length;i++)if(predicate(scan.cls[i])){
    xyz[n++]=scan.xyz[3*i];xyz[n++]=scan.xyz[3*i+1];xyz[n++]=scan.xyz[3*i+2];
  }
  return xyz.subarray(0,n);
}
function assess(xyz,truth,gate,mode,negative){
  let start=performance.now();
  const f=features({xyz},gate,mode);
  const heights=f.pos.map((_,i)=>f.X[13*i]);
  const pins=detectionStages(f,heights,0,separation).selected;
  timingsMs.features[mode]+=performance.now()-start;
  start=performance.now();
  const matches=MATCH_RADII_METERS.map(radius=>matchCenters(pins,truth,radius).count);
  const result={proposals:f.pos.length,pins:pins.length};
  if(negative){
    result.falsePins=pins.length;
    result.accidental=matches.map((count,i)=>({cm:MATCH_RADII_METERS[i]*100,count}));
  }else{
    result.reached15cm=matchCenters(f.pos,truth,.15).count;
    result.scores=matches.map((tp,i)=>({cm:MATCH_RADII_METERS[i]*100,tp,fp:pins.length-tp,fn:truth.length-tp}));
  }
  timingsMs.matching+=performance.now()-start;
  return result;
}
function aggregate(group){
  const sum=pick=>group.reduce((total,row)=>total+pick(row),0);
  const totals={plots:group.length,originalTargets:sum(r=>r.targets),
    proposals:sum(r=>r.result.proposals),pins:sum(r=>r.result.pins)};
  if(group[0].sample!=='full'){
    totals.falsePins=totals.pins;
    totals.accidental=MATCH_RADII_METERS.map((radius,i)=>({cm:radius*100,count:sum(r=>r.result.accidental[i].count)}));
    return totals;
  }
  totals.reached15cm=sum(r=>r.result.reached15cm);
  totals.scores=MATCH_RADII_METERS.map((radius,i)=>{
    const tp=sum(r=>r.result.scores[i].tp), fp=totals.pins-tp, fn=totals.originalTargets-tp;
    return {cm:100*radius,tp,fp,fn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,
      f1:2*tp+fp+fn?2*tp/(2*tp+fp+fn):null};
  });
  return totals;
}
for(const [seedGroup,seeds] of Object.entries(seedGroups))for(const seed of seeds){
  let pairedTargets;
  for(const sensor of layouts)for(const condition of conditions){
    const clutter=condition==='noisy-clutter';
    const recipe=makeRecipe(seed,true,getSensor(sensor),crop,architecture,form,'healthy');
    let start=performance.now();
    const scan=field({...recipe,points,weeds:clutter,sticks:clutter,boards:clutter,
      scanNoise:clutter?{seed:recipe.scanNoise.seed,...noise}:null});
    timingsMs.generation+=performance.now()-start;
    assert.equal(scan.sampledRays,points);
    const truth=targetCenters(scan.labels.boxes);
    pairedTargets??=truth;
    assert.deepEqual(truth,pairedTargets);
    start=performance.now();
    const soil=xyzSubset(scan,c=>c===0), background=clutter?xyzSubset(scan,c=>c!==1):soil;
    timingsMs.prepareControls+=performance.now()-start;
    for(const [sample,xyz] of [['full',scan.xyz],['soil',soil],...(clutter?[['noncrop',background]]:[])]){
      for(const gate of (seedGroup==='primary'?gates:[.065]))for(const mode of modes){
        const result=assess(xyz,truth,gate,mode,sample!=='full');
        rows.push({seedGroup,seed,sensor,condition,tile:scan.labels.tile_id,sample,sampledRays:scan.sampledRays,
          returns:xyz.length/3,targets:truth.length,gate,mode,result});
      }
    }
  }
}
const groups=Object.groupBy(rows,r=>[r.seedGroup,r.sensor,r.condition,r.sample,r.gate,r.mode].join('/'));
const summary=Object.fromEntries(Object.entries(groups).map(([key,group])=>[key,aggregate(group)]));
console.log(JSON.stringify({domain:'synthetic',backend:'Node CPU',node:process.version,cpu:cpus()[0]?.model,
  design:{seedGroups,layouts,conditions,noise,points,architecture,crop,form,primaryGate:gates[0],primarySensitivityGate:gates[1],modes,separation},
  controlScoring:'All pins on soil/noncrop subsets are false detections. Accidental counts measure one-to-one proximity to original crop targets at each tolerance.',
  timingsMs,summary,rows},null,2));
