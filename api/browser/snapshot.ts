import type { IncomingMessage, ServerResponse } from 'http';
import handler from '../browser.ts';

export default async function snapshotHandler(req: IncomingMessage, res: ServerResponse) {
  return handler(req, res);
}
