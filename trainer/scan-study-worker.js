import {field} from './field.js?v=paired-study1';
import {analyzeStudyScan,checkStudyPair} from './scan-study.js';
import {RAY_BUDGETS} from './sensors.js';

self.onmessage = ({data:{recipe,budgets}}) => {
  try {
    if (budgets.length!==2 || !budgets.every(n=>RAY_BUDGETS.includes(n)) || budgets[0]>=budgets[1]) {
      throw Error('Choose a second budget higher than the first.');
    }
    const results=[];
    for(const [arm,points] of budgets.entries()) {
      const start=performance.now();
      const scan=field({...recipe,points},({cloud,row,rows})=>{
        self.postMessage({type:'row',arm,cloud,row,rows},[cloud.buffer]);
      });
      const generated=performance.now();
      const result=analyzeStudyScan(scan);
      result.timingsMs={generation:generated-start,scoring:performance.now()-generated};
      results.push(result);
      self.postMessage({type:'arm',arm,result});
    }
    checkStudyPair(...results);
    self.postMessage({type:'complete'});
  } catch(error) {self.postMessage({type:'error',message:error.message});}
};
