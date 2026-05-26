/*! coi-serviceworker v0.1.7 - Guido Zuidhof and contributors, licensed under MIT */
/* Source: https://github.com/gzuidhof/coi-serviceworker */
/* Habilita SharedArrayBuffer no GitHub Pages servindo headers COOP/COEP via Service Worker */

let coepCredentialless = false;
if (typeof window === 'undefined') {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener("message", (ev) => {
    if (!ev.data) return;
    if (ev.data.type === "deregister") {
      self.registration.unregister().then(() => self.clients.matchAll()).then(clients => {
        clients.forEach(client => client.navigate(client.url));
      });
    } else if (ev.data.type === "coepCredentialless") {
      coepCredentialless = ev.data.value;
    }
  });

  self.addEventListener("fetch", function (event) {
    const r = event.request;
    if (r.cache === "only-if-cached" && r.mode !== "same-origin") return;

    const request = (coepCredentialless && r.mode === "no-cors")
      ? new Request(r, { credentials: "omit" })
      : r;

    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 0) return response;
          const newHeaders = new Headers(response.headers);
          newHeaders.set("Cross-Origin-Embedder-Policy",
            coepCredentialless ? "credentialless" : "require-corp");
          if (!coepCredentialless) newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
          newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
          });
        })
        .catch((e) => console.error(e))
    );
  });

} else {
  (() => {
    const reloadedBySelf = window.sessionStorage.getItem("coiReloadedBySelf");
    window.sessionStorage.removeItem("coiReloadedBySelf");
    const coepDegrading = (reloadedBySelf === "coepdegrade");

    // Você pode customizar o comportamento desse SW via window.coi
    window.coi = {
      shouldRegister: () => !reloadedBySelf,
      shouldDeregister: () => false,
      coepCredentialless: () => true,
      coepDegrade: () => true,
      doReload: () => window.location.reload(),
      quiet: false,
      ...window.coi
    };

    const n = navigator;
    if (n.serviceWorker && n.serviceWorker.controller) {
      n.serviceWorker.controller.postMessage({
        type: "coepCredentialless",
        value: (coepDegrading || !window.crossOriginIsolated)
          ? false
          : window.coi.coepCredentialless()
      });
      if (window.coi.shouldDeregister()) {
        n.serviceWorker.controller.postMessage({ type: "deregister" });
      }
    }

    // Se ainda não cross-origin isolated, registra o SW e recarrega
    if (!window.crossOriginIsolated && !window.coi.shouldDeregister() && window.coi.shouldRegister()) {
      if (!n.serviceWorker) {
        if (!window.coi.quiet) console.error("COI: serviceworker not available, cannot register");
        return;
      }
      n.serviceWorker.register(window.document.currentScript.src).then(
        (registration) => {
          if (!window.coi.quiet) console.log("COOP/COEP Service Worker registered", registration.scope);
          registration.addEventListener("updatefound", () => {
            if (!window.coi.quiet) console.log("Reloading page to make use of updated COOP/COEP Service Worker.");
            window.sessionStorage.setItem("coiReloadedBySelf", "updatefound");
            window.coi.doReload();
          });
          // Se SW está controlando a página agora pela 1ª vez, recarrega pra applicar headers
          if (registration.active && !n.serviceWorker.controller) {
            if (!window.coi.quiet) console.log("Reloading page to make use of COOP/COEP Service Worker.");
            window.sessionStorage.setItem("coiReloadedBySelf", "notcontrolling");
            window.coi.doReload();
          }
        },
        (err) => {
          if (!window.coi.quiet) console.error("COOP/COEP Service Worker failed to register:", err);
        }
      );
    }
  })();
}
