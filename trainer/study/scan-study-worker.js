import {field,sampleCloud} from '../generator/field.js?v=paired-study1';
import {analyzeStudyScan,checkStudyPair,studyRecipes} from './scan-study.js?v=orchard-spacing1';

self.onmessage = ({data:{recipe,budgets,mode='budgets',orchardSpacing}}) => {
  try {
    const results=[];
    let sharedScan;
    for(const [arm,settings] of studyRecipes(recipe,mode,budgets).entries()) {
      const start=performance.now();
      const scan=sharedScan ?? field(settings,({cloud,row,rows})=>{
        self.postMessage({type:'row',arm,cloud,row,rows},[cloud.buffer]);
      });
      const generated=performance.now();
      const reuse=Boolean(sharedScan);
      const result=analyzeStudyScan(scan,mode,mode==='spacing' && arm===1 ? orchardSpacing : undefined);
      if (mode==='spacing') {
        sharedScan=scan;
        result.reusedScan=reuse;
      }
      result.timingsMs={generation:reuse ? 0 : generated-start,scoring:performance.now()-generated};
      results.push(result);
      const cloud=sampleCloud(scan.xyz,scan.cls);
      self.postMessage({type:'arm',arm,result,cloud},[cloud.buffer]);
    }
    checkStudyPair(...results);
    self.postMessage({type:'complete'});
  } catch(error) {self.postMessage({type:'error',message:error.message});}
};
