// Restore the short vowels usually omitted in written Arabic before phonemization.
export function arabicVowels(ort,session,maps) {
  const targets=Object.fromEntries(Object.entries(maps.target).map(([mark,id])=>[id,mark==='_'?'':mark]));
  const mark=/^[\u064b-\u0652]$/u;
  return async text=>{
    const entries=[];
    for(const ch of text) {
      if(mark.test(ch) && entries.length)entries.at(-1).hint+=ch;
      else entries.push({ch,hint:''});
    }
    const letters=entries.filter(entry=>{
      entry.id=maps.input[entry.ch] ?? (/[0-9٠-٩]/u.test(entry.ch)?maps.input['#']:undefined);
      return entry.id!==undefined;
    });
    if(!letters.length)return text;
    const vector=(values,shape)=>new ort.Tensor('int64',BigInt64Array.from(values,BigInt),shape);
    const {predictions}=await session.run({
      char_inputs:vector(letters.map(e=>e.id),[1,letters.length]),
      diac_inputs:vector(letters.map(e=>maps.hint[e.hint] ?? maps.hint['']),[1,letters.length]),
      input_lengths:vector([letters.length],[1])
    });
    letters.forEach((entry,i)=>{entry.hint=targets[predictions.data[i]] || '';});
    return entries.map(e=>e.ch+e.hint).join('');
  };
}
