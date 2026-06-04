/**
 * Client-side router — hash-based SPA navigation
 */

let currentRoute = '';
const routeHandlers = {};

export function registerRoute(pattern, handler) {
  routeHandlers[pattern] = handler;
}

export function navigate(route) {
  window.location.hash = `#/${route}`;
}

export function getCurrentRoute() {
  return currentRoute;
}

function parseRoute() {
  const hash = window.location.hash.replace(/^#\//, '');
  return hash || 'dashboard';
}

export function initRouter(renderPage) {
  const handleRoute = () => {
    const route = parseRoute();
    currentRoute = route;
    renderPage(route);
  };

  window.addEventListener('hashchange', handleRoute);
  handleRoute(); // Handle initial route
}
