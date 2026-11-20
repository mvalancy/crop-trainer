import {field} from './field.js?v=live1';

self.onmessage = ({data}) => {
  // Previously opened viewers send just the recipe and expect a single scan.
  const scan = field(data.recipe ?? data, data.preview ? frame => {
    self.postMessage({frame}, [frame.cloud.buffer]);
  } : undefined);
  self.postMessage(data.recipe ? {scan} : scan, [scan.xyz.buffer, scan.cls.buffer]);
};
