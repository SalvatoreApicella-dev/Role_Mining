const SAVE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function getMethod(input, init) {
  if (init?.method) return String(init.method).toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) {
    return String(input.method || "GET").toUpperCase();
  }
  return "GET";
}

export function installSaveLoadingRuntime() {
  if (typeof window === "undefined" || window.__rmSaveLoadingInstalled) return;
  window.__rmSaveLoadingInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const method = getMethod(input, init);
    const tracked = SAVE_METHODS.has(method);

    if (tracked) {
      window.dispatchEvent(new CustomEvent("rm:save:start"));
    }
    try {
      const res = await originalFetch(input, init);
      if (tracked) {
        window.dispatchEvent(new CustomEvent("rm:save:end"));
      }
      return res;
    } catch (e) {
      if (tracked) {
        window.dispatchEvent(new CustomEvent("rm:save:end"));
      }
      throw e;
    }
  };
}
