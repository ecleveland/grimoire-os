// Route prefixes reachable without an authenticated session. Single source of
// truth shared by two layers that must agree, or the app ping-pongs /login ↔ /
// (VEG-419): the middleware (decides whether to bounce an unauthenticated
// request to /login) and the client's dead-session teardown (skips the redirect
// when the user is already on a public route). A path matches if it starts with
// any prefix here — keep the matching rule identical in both consumers.
export const PUBLIC_PATH_PREFIXES = ['/login', '/register', '/srd'];
