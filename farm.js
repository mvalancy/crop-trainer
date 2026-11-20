import {field} from './trainer/field.js';
import {makeRecipe} from './trainer/data.js';
const $=id=>document.getElementById(id);
const patterns={grid:{key:'reference',pattern:'grid',along:0,across:0},lines:{key:'sparse-lines',pattern:'lines',along:9,across:18},rings:{key:'wide-rings',pattern:'rings',along:1,across:16,alongCount:1024,acrossCount:64}};
let scan;
function draw(){
 const canvas=$('map'),g=canvas.getContext('2d'),xyz=scan.xyz;
 g.fillStyle='#19392d';g.fillRect(0,0,canvas.width,canvas.height);
 const project=(x,y,z)=>[410+(x-y)*37,55+(x+y)*19-z*128];
 const palette=['#718167','#b4d66b','#7fbb5e','#bc9c6b','#d79c67','#adbeb8'];
 for(let i=0;i<scan.cls.length;i++){
  const [u,v]=project(xyz[3*i],xyz[3*i+1],xyz[3*i+2]);
  g.fillStyle=palette[scan.cls[i]];g.fillRect(u,v,2,2);
 }
 if($('pins').checked){g.fillStyle='#ff745e';for(const {min,max} of scan.labels.boxes){
  const [u,v]=project((min[0]+max[0])/2,(min[1]+max[1])/2,max[2]);
  g.fillRect(u-1.5,v-1.5,3,3);
 }}
}
function grow(){
 const recipe=makeRecipe(Number($('seed').value),$('ground').checked,patterns[$('scan').value]);
 scan=field(recipe);draw();$('count').textContent=scan.labels.boxes.length+' planted heads · '+(scan.xyz.length/3).toLocaleString()+' LiDAR returns · seed '+recipe.seed;
 $('ply').disabled=$('labels').disabled=false;
}
$('grow').onsubmit=e=>{e.preventDefault();grow()};$('pins').onchange=draw;
function download(data,ext){const a=document.createElement('a'),url=URL.createObjectURL(new Blob(data));a.href=url;a.download=scan.labels.tile_id+ext;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
$('labels').onclick=()=>download([JSON.stringify(scan.labels,null,2)],'.json');
$('ply').onclick=()=>{const bytes=new DataView(new ArrayBuffer(scan.xyz.byteLength));scan.xyz.forEach((v,i)=>bytes.setFloat32(i*4,v,true));download(['ply\nformat binary_little_endian 1.0\nelement vertex '+scan.xyz.length/3+'\nproperty float x\nproperty float y\nproperty float z\nend_header\n',bytes],'.ply')};
function journal(){try{const f=JSON.parse(localStorage.getItem('crop-trainer-farm-v1')||'{}');
 for(const [key,done] of [['first',f.seeds?.length],['scout',f.mixed],['saver',f.seeds?.length>=2]]){
  const el=$(key);el.textContent=done?'Stamp earned':'Open';el.parentElement.classList.toggle('earned',Boolean(done));
 }}catch{}}
window.addEventListener('pageshow',journal);grow();journal();
