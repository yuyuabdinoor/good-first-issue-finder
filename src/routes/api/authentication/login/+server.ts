import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const ghAuthURL = 'https://github.com/login/oauth/authorize';
const clientId = env.FINDER_GITHUB_CLIENT_ID;
export const GET: RequestHandler = async ({ cookies, url }) => {
  const csrfState = Math.random().toString(36).substring(7);
  const csrfCookie = cookies.serialize('state', csrfState, {
    maxAge: 1000 * 60 * 3,
    httpOnly: true,
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
