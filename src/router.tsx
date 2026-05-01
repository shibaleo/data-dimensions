import { lazy, Suspense } from "react";
import {
  createRouter,
  createRoute,
  createRootRoute,
  redirect,
  Outlet,
} from "@tanstack/react-router";
import { AuthGate } from "@/components/auth/auth-gate";
import { ServiceProvider } from "@/hooks/use-service";
import { AppLayout } from "@/components/layout/app-layout";
import { AuthenticateWithRedirectCallback } from "@clerk/react";

/* ── Lazy page imports ── */

const ServicesPage = lazy(() => import("./app/(pages)/services/page"));
const ServiceDetailPage = lazy(() => import("./app/(pages)/services/$serviceCode/page"));
const UsersPage = lazy(() => import("./app/(pages)/users/page"));
const ApiKeysPage = lazy(() => import("./app/(pages)/api-keys/page"));
const AboutPage = lazy(() => import("./app/(pages)/about/page"));

/* ── Route tree ── */

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const authLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: "authenticated",
  component: () => (
    <AuthGate>
      <ServiceProvider>
        <AppLayout>
          <Suspense>
            <Outlet />
          </Suspense>
        </AppLayout>
      </ServiceProvider>
    </AuthGate>
  ),
});

function lazyRoute(
  path: string,
  Component: React.LazyExoticComponent<React.ComponentType>,
) {
  return createRoute({
    getParentRoute: () => authLayout,
    path,
    component: () => <Component />,
  });
}

const servicesRoute = lazyRoute("/services", ServicesPage);
const serviceDetailRoute = createRoute({
  getParentRoute: () => authLayout,
  path: "/services/$serviceCode",
  component: () => <ServiceDetailPage />,
});
const usersRoute = lazyRoute("/users", UsersPage);
const apiKeysRoute = lazyRoute("/api-keys", ApiKeysPage);
const aboutRoute = lazyRoute("/about", AboutPage);

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/services" as string });
  },
});

const ssoCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sso-callback",
  component: () => <AuthenticateWithRedirectCallback />,
});

const routeTree = rootRoute.addChildren([
  authLayout.addChildren([
    servicesRoute,
    serviceDetailRoute,
    usersRoute,
    apiKeysRoute,
    aboutRoute,
  ]),
  indexRoute,
  ssoCallbackRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
