import {field,sampleCloud} from '../generator/field.js?v=paired-study1';
import {analyzeStudyScan,checkStudyPair,studyRecipes} from './scan-study.js?v=damage-study1';

self.onmessage = ({data:{recipe,budgets,mode='budgets'}}) => {
  try {
    const results=[];
    for(const [arm,settings] of studyRecipes(recipe,mode,budgets).entries()) {
      const start=performance.now();
      const scan=field(settings,({cloud,row,rows})=>{
        self.postMessage({type:'row',arm,cloud,row,rows},[cloud.buffer]);
      });
      const generated=performance.now();
      const result=analyzeStudyScan(scan,mode);
      result.timingsMs={generation:generated-start,scoring:performance.now()-generated};
      results.push(result);
      const cloud=sampleCloud(scan.xyz,scan.cls);
      self.postMessage({type:'arm',arm,result,cloud},[cloud.buffer]);
    }
    checkStudyPair(...results);
    self.postMessage({type:'complete'});
  } catch(error) {self.postMessage({type:'error',message:error.message});}
};
