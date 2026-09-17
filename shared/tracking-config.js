(() => {
  const localHost = location.hostname === "127.0.0.1" || location.hostname === "localhost";
  window.SUMMITFORGE_TRACKING = Object.freeze({
    endpoint: localHost
      ? "http://127.0.0.1:8787"
      : "https://summitforge-lead-collector.summitforge-lead-tracking.workers.dev",
    privacyUrl: "../privacy.html",
    version: "2",
  });
})();
