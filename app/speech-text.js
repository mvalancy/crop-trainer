// Expand notation before pronunciation; the transcript keeps the measured value as written.
export function speechText(text,lang) {
  if(lang==='ar'){
    const digits=['صفر','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة'];
    return text.replace(/\bLiDAR\b/gi,'ليدار').replace(/\bF1\b/g,'إف واحد')
      .replace(/(\d+)\.(\d+)/g,(_,a,b)=>(a==='0'?'صفر':a)+' فاصلة '+[...b].map(n=>digits[Number(n)]).join(' '))
      .replace(/%/g,' في المئة ').replace(/\bcm\b/g,'سنتيمتر');
  }
  if(lang==='en')return text.replace(/\bLiDAR\b/gi,'lidar').replace(/\b(PLY|CSV|GPU|CPU|XYZ)\b/g,v=>[...v].join(' ')).replace(/\bF1\b/g,'F one');
  return text.replace(/\bLiDAR\b/gi,lang==='zh'?'激光雷达':'lidar');
}
