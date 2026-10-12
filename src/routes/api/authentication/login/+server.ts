import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const ghAuthURL = 'https://github.com/login/oauth/authorize';
const clientId = env.FINDER_GITHUB_CLIENT_ID;
export const GET: RequestHandler = async ({ cookies, url }) => {
  const csrfState = crypto.randomUUID();
  const csrfCookie = cookies.serialize('state', csrfState, {
    maxAge: 60 * 3,
    httpOnly: true,
    sameSite: 'lax',
    secure: url.protocol === 'https:',
    path: '/',
  });

  const authorizeUrl = new URL(ghAuthURL);
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('state', csrfState);
  authorizeUrl.searchParams.set('redirect_uri', `${url.origin}/api/authentication/callback`);

  return new Response(null, {
    status: 302,
    headers: {
      'set-cookie': csrfCookie,
      location: authorizeUrl.toString(),
    },
  });
};
