import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';
import * as jose from 'https://esm.sh/jose@6.1.0';
import { createProviders } from './providers.mjs';
import { createHandler } from './service.mjs';

import { createNotificationVerifier, createNotificationHandler } from './notifications.mjs';

const env = (name: string) => Deno.env.get(name) || '';
const providers = createProviders(env, jose);
const handle = createHandler({ env, createClient, providers });
const notify = createNotificationHandler({ env, createClient, verify: createNotificationVerifier(env, jose) });
Deno.serve((req) => {
  const match = new URL(req.url).pathname.match(/\/notifications\/(apple|kakao)$/);
  return match ? notify(req, match[1]) : handle(req);
});
