import {field,sampleCloud} from '../generator/field.js?v=board-placement1';
import {analyzeStudyScan,checkStudyPair,studyRecipes} from './scan-study.js?v=board-placement1';

self.onmessage = ({data:{recipe,budgets,mode='budgets',orchardSpacing}}) => {
  try {
    const results=[];
    let sharedScan;
    const recipes=studyRecipes(recipe,mode,budgets);
    const shared=recipes[0]===recipes[1];
    for(const [arm,settings] of recipes.entries()) {
      const start=performance.now();
      const scan=sharedScan ?? field(settings,({cloud,row,rows})=>{
        self.postMessage({type:'row',arm,cloud,row,rows},[cloud.buffer]);
      });
      const generated=performance.now();
      const reuse=Boolean(sharedScan);
      const orchardOptions={};
      if(arm===1 && mode==='spacing') orchardOptions.separationMeters=orchardSpacing;
      if(arm===1 && mode==='ranking') orchardOptions.ranking='low-wood';
      const result=analyzeStudyScan(scan,mode,orchardOptions);
      if (shared) {
        sharedScan=scan;
        result.reusedScan=reuse;
      }
      result.timingsMs={generation:reuse ? 0 : generated-start,scoring:performance.now()-generated};
      results.push(result);
      const cloud=sampleCloud(scan.xyz,scan.cls);
      if (mode==='boards') {
        result.reusedScan=false;
        result.previewPoints=cloud.length/4;
        let visible=0;
        for(let i=3;i<cloud.length;i+=4) if(cloud[i]===4) visible++;
        result.boardPreviewReturns=visible;
      }
      self.postMessage({type:'arm',arm,result,cloud},[cloud.buffer]);
    }
    checkStudyPair(...results);
    self.postMessage({type:'complete'});
  } catch(error) {self.postMessage({type:'error',message:error.message});}
};
