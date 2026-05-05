import { fetchFeed } from './feed-service.mjs';

export function createApp(options = {}) {
  const fetchFeedImpl = options.fetchFeed ?? fetchFeed;

  return async function handleRequest(request, response) {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

    if (request.method !== 'GET') {
      return sendJson(response, 405, {
        error: 'method_not_allowed',
        message: 'Only GET requests are supported.',
      });
    }

    if (url.pathname !== '/api/feed') {
      return sendJson(response, 404, {
        error: 'not_found',
        message: 'Route not found.',
      });
    }

    try {
      const feed = await fetchFeedImpl(url.searchParams.get('url'));
      return sendJson(response, 200, feed);
    } catch (error) {
      return sendJson(response, getStatusCode(error), {
        error: getErrorCode(error),
        message: error.message,
      });
    }
  };
}

function getStatusCode(error) {
  const message = error?.message ?? '';

  if (message.includes('required') || message.includes('valid absolute URL') || message.includes('http or https')) {
    return 400;
  }

  if (message.includes('supported RSS or Atom feed')) {
    return 422;
  }

  return 502;
}

function getErrorCode(error) {
  const statusCode = getStatusCode(error);

  if (statusCode === 400) {
    return 'invalid_request';
  }

  if (statusCode === 422) {
    return 'unsupported_feed';
  }

  return 'feed_fetch_failed';
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(`${JSON.stringify(payload)}\n`);
}
