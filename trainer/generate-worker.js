import {field} from './field.js?v=dense1';

self.onmessage = ({data: recipe}) => {
  const scan = field(recipe);
  self.postMessage(scan, [scan.xyz.buffer, scan.cls.buffer]);
};
