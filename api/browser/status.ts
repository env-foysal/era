import type { IncomingMessage, ServerResponse } from 'http';
import handler from '../browser.ts';

export default async function statusHandler(req: IncomingMessage, res: ServerResponse) {
  return handler(req, res);
}
