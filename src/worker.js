// Serves the static site from public/. Requests to www.remtadigital.com are redirected to the
// apex domain with a 301, so search engines see one site instead of two copies.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'www.remtadigital.com') {
      url.hostname = 'remtadigital.com';
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
