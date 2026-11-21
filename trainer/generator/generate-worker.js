import {field} from './field.js?v=board-placement1';

self.onmessage = ({data}) => {
  // Previously opened viewers send just the recipe and expect a single scan.
  const scan = field(data.recipe ?? data, data.preview ? frame => {
    self.postMessage({frame}, [frame.cloud.buffer]);
  } : undefined);
  const buffers = [scan.xyz.buffer, scan.cls.buffer];
  if (scan.parts) buffers.push(scan.parts.buffer);
  if (scan.skeleton) buffers.push(scan.skeleton.buffer);
  self.postMessage(data.recipe ? {scan} : scan, buffers);
};
