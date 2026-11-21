import {randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {copyFile,link,lstat,open,unlink} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';

function occupied(path) {
  return Error('Output already exists: '+path+'. Choose a new filename.');
}

export async function checkOutputPaths(paths) {
  if (new Set(paths.map(path=>resolve(path))).size !== paths.length) {
    throw Error('Choose different filenames for the report and model weights.');
  }
  for (const path of paths) {
    try {await lstat(path);} catch (err) {
      if (err.code === 'ENOENT') continue;
      throw err;
    }
    throw occupied(path);
  }
}

// Stage each complete JSON before publishing. Roll back files created by this
// invocation if a destination was taken between the initial check and export.
export async function writeNewJson(files) {
  const staged = [], published = [];
  try {
    for (const [path,value] of files) {
      const temp = join(dirname(path),'.crop-trainer-'+randomUUID()+'.tmp');
      const handle = await open(temp,'wx',0o600);
      staged.push({temp,path});
      try {await handle.writeFile(JSON.stringify(value,null,2)+'\n');}
      finally {await handle.close();}
    }
    for (const {temp,path} of staged) {
      try {
        try {await link(temp,path);}
        catch (err) {
          // Removable drives can lack hard links. Keep exclusive creation there.
          if (!['ENOTSUP','EOPNOTSUPP','EPERM','ENOSYS'].includes(err.code)) throw err;
          await copyFile(temp,path,constants.COPYFILE_EXCL);
        }
      } catch (err) {
        if (err.code === 'EEXIST') throw occupied(path);
        throw err;
      }
      published.push(path);
    }
  } catch (err) {
    await Promise.all(published.map(path=>unlink(path)));
    throw err;
  } finally {
    await Promise.all(staged.map(({temp})=>unlink(temp)));
  }
}
