// Share a single copy of the recorded languages and optional voice models between both apps.
import {access,readdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join,relative,resolve} from 'node:path';
const root=resolve(process.argv[2]);
const modulePath=join(root,'next/app/standalone-access.js');
try {await access(modulePath);} catch(error) {
  if(error.code!=='ENOENT')throw error;
  // A previous verified preview can still be live while the new one is being tested.
  console.log('Using the standalone controls supplied by this release.');
  process.exit(0);
}
for(const path of await readdir(root,{recursive:true})){
  if(path.startsWith('next/') || !path.endsWith('.html'))continue;
  const file=join(root,path),src=relative(dirname(file),modulePath);
  const html=await readFile(file,'utf8');
  await writeFile(file,html.replace('</head>','<script type="module" src="'+src+'"></script></head>'));
}
