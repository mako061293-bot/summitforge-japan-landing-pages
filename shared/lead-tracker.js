(() => {
  "use strict";

  const config = window.SUMMITFORGE_TRACKING || {};
  const endpoint = String(config.endpoint || "").replace(/\/+$/, "");
  if (!endpoint) return;

  const CONSENT_KEY = `summitforgeTrackingConsent:v${config.version || "1"}`;
  const VISITOR_KEY = "summitforgeVisitorId";
  const VISIT_COUNT_KEY = "summitforgeVisitCount";
  const SESSION_KEY = "summitforgeSession";
  const SESSION_TIMEOUT = 30 * 60 * 1000;
  const body = document.body;
  const pageId = body.dataset.page || location.pathname;
  const campaignId = body.dataset.campaign || "summitforge";
  const queue = [];
  const scrollMilestones = new Set();
  const engagementMilestones = new Set();
  const diagnosisState = { stock_code: "", concern: "", age_group: "" };
  let trackerStarted = false;
  let flushTimer = 0;
  let activeSeconds = 0;
  let visibleSince = document.visibilityState === "visible" ? performance.now() : null;
  let maxScrollDepth = 0;
  let deviceDetails = getBasicDeviceDetails();

  const randomId = () => {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
  };

  const storageGet = (storage, key) => {
    try {
      return storage.getItem(key);
    } catch (_error) {
      return null;
    }
  };

  const storageSet = (storage, key, value) => {
    try {
      storage.setItem(key, value);
    } catch (_error) {
      // Tracking must never interfere with the landing page.
    }
  };

  const getConsent = () => storageGet(localStorage, CONSENT_KEY);

  const sanitizeReferrer = () => {
    if (!document.referrer) return "";
    try {
      const url = new URL(document.referrer);
      return `${url.origin}${url.pathname}`.slice(0, 500);
    } catch (_error) {
      return "";
    }
  };

  const utmValues = () => {
    const params = new URLSearchParams(location.search);
    const value = (name) => (params.get(name) || "").slice(0, 160);
    return {
      utm_source: value("utm_source"),
      utm_medium: value("utm_medium"),
      utm_campaign: value("utm_campaign"),
      utm_content: value("utm_content"),
      utm_term: value("utm_term"),
    };
  };

  function getBasicDeviceDetails() {
    const ua = navigator.userAgent || "";
    let deviceType = /iPad|Tablet/i.test(ua) ? "tablet" : /Mobi|Android|iPhone/i.test(ua) ? "mobile" : "desktop";
    let osName = "Unknown";
    let osVersion = "";
    let browserName = "Unknown";
    let browserVersion = "";

    const osMatch = ua.match(/Windows NT ([\d.]+)/i);
    const androidMatch = ua.match(/Android\s([\d.]+)/i);
    const iosMatch = ua.match(/(?:iPhone OS|CPU OS)\s([\d_]+)/i);
    const macMatch = ua.match(/Mac OS X\s([\d_]+)/i);
    if (androidMatch) [osName, osVersion] = ["Android", androidMatch[1]];
    else if (iosMatch) [osName, osVersion] = ["iOS", iosMatch[1].replaceAll("_", ".")];
    else if (osMatch) [osName, osVersion] = ["Windows", osMatch[1]];
    else if (macMatch) [osName, osVersion] = ["macOS", macMatch[1].replaceAll("_", ".")];
    else if (/Linux/i.test(ua)) osName = "Linux";

    const browserPatterns = [
      ["Edge", /Edg\/([\d.]+)/],
      ["Opera", /OPR\/([\d.]+)/],
      ["Chrome", /(?:Chrome|CriOS)\/([\d.]+)/],
      ["Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/],
      ["Safari", /Version\/([\d.]+).*Safari/],
    ];
    for (const [name, pattern] of browserPatterns) {
      const match = ua.match(pattern);
      if (match) {
        browserName = name;
        browserVersion = match[1];
        break;
      }
    }

    return { deviceType, deviceModel: "", osName, osVersion, browserName, browserVersion };
  }

  const loadHighEntropyDeviceDetails = async () => {
    if (!navigator.userAgentData?.getHighEntropyValues) return;
    try {
      const values = await Promise.race([
        navigator.userAgentData.getHighEntropyValues(["model", "platformVersion", "fullVersionList"]),
        new Promise((resolve) => setTimeout(() => resolve(null), 700)),
      ]);
      if (!values) return;
      const browser = values.fullVersionList?.find((item) => !/Not.A.Brand/i.test(item.brand));
      deviceDetails = {
        ...deviceDetails,
        deviceModel: values.model || "",
        osName: navigator.userAgentData.platform || deviceDetails.osName,
        osVersion: values.platformVersion || deviceDetails.osVersion,
        browserName: browser?.brand || deviceDetails.browserName,
        browserVersion: browser?.version || deviceDetails.browserVersion,
      };
    } catch (_error) {
      // High-entropy hints are optional and browser-controlled.
    }
  };

  const getOrCreateVisitorId = () => {
    const stored = storageGet(localStorage, VISITOR_KEY);
    if (stored) return stored;
    const created = randomId();
    storageSet(localStorage, VISITOR_KEY, created);
    return created;
  };

  const getSession = () => {
    const now = Date.now();
    let stored;
    try {
      stored = JSON.parse(storageGet(sessionStorage, SESSION_KEY) || "null");
    } catch (_error) {
      stored = null;
    }

    const isNew = !stored?.id || !stored.lastActivity || now - stored.lastActivity > SESSION_TIMEOUT;
    let visitNumber = Number(storageGet(localStorage, VISIT_COUNT_KEY) || 0);
    if (isNew) visitNumber += 1;
    if (!visitNumber) visitNumber = 1;

    const session = {
      id: isNew ? randomId() : stored.id,
      lastActivity: now,
      visitNumber,
      isNew,
    };
    storageSet(sessionStorage, SESSION_KEY, JSON.stringify(session));
    storageSet(localStorage, VISIT_COUNT_KEY, String(visitNumber));
    return session;
  };

  const visitorId = getOrCreateVisitorId();
  const session = getSession();
  const attribution = utmValues();
  const referrer = sanitizeReferrer();

  const baseEvent = () => ({
    event_id: randomId(),
    visitor_id: visitorId,
    session_id: session.id,
    campaign_id: campaignId,
    page_id: pageId,
    occurred_at: new Date().toISOString(),
    age_group: "",
    cta_location: "",
    referrer,
    ...attribution,
    visit_number: session.visitNumber,
    device_type: deviceDetails.deviceType,
    device_model: deviceDetails.deviceModel,
    os_name: deviceDetails.osName,
    os_version: deviceDetails.osVersion,
    browser_name: deviceDetails.browserName,
    browser_version: deviceDetails.browserVersion,
    language: (navigator.languages || [navigator.language]).filter(Boolean).join(",").slice(0, 80),
    browser_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    screen_width: screen.width || 0,
    screen_height: screen.height || 0,
    viewport_width: innerWidth || 0,
    viewport_height: innerHeight || 0,
    device_pixel_ratio: devicePixelRatio || 1,
    scroll_depth: 0,
    duration_seconds: 0,
    metadata: { page_path: location.pathname },
  });

  const flush = (beacon = false) => {
    window.clearTimeout(flushTimer);
    flushTimer = 0;
    if (!queue.length) return;
    const batch = queue.splice(0, 20);
    const payload = JSON.stringify({ events: batch });

    if (beacon && navigator.sendBeacon) {
      const accepted = navigator.sendBeacon(`${endpoint}/v1/events`, new Blob([payload], { type: "text/plain;charset=UTF-8" }));
      if (!accepted) queue.unshift(...batch);
    } else {
      fetch(`${endpoint}/v1/events`, {
        method: "POST",
        body: new Blob([payload], { type: "text/plain;charset=UTF-8" }),
        mode: "cors",
        credentials: "omit",
        keepalive: true,
      }).catch(() => {});
    }

    if (queue.length && !beacon) flushTimer = window.setTimeout(() => flush(false), 500);
  };

  const track = (eventName, details = {}, immediate = false) => {
    if (!trackerStarted || getConsent() !== "granted") return;
    session.lastActivity = Date.now();
    storageSet(sessionStorage, SESSION_KEY, JSON.stringify(session));
    queue.push({ ...baseEvent(), event_name: eventName, ...details });
    if (queue.length >= 10 || immediate) flush(immediate);
    else if (!flushTimer) flushTimer = window.setTimeout(() => flush(false), 1200);
  };

  const updateVisibleTime = () => {
    if (visibleSince == null) return;
    const now = performance.now();
    activeSeconds += Math.max(0, (now - visibleSince) / 1000);
    visibleSince = now;
  };

  const currentScrollDepth = () => {
    const total = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    if (total <= innerHeight) return 100;
    return Math.min(100, Math.round(((scrollY + innerHeight) / total) * 100));
  };

  const evaluateScroll = () => {
    const depth = currentScrollDepth();
    maxScrollDepth = Math.max(maxScrollDepth, depth);
    for (const milestone of [25, 50, 75, 90, 100]) {
      if (depth >= milestone && !scrollMilestones.has(milestone)) {
        scrollMilestones.add(milestone);
        track("scroll_depth", { scroll_depth: milestone });
      }
    }
  };

  const bindInteractionTracking = () => {
    document.querySelectorAll("[data-open-age-modal], [data-open-diagnosis-flow]").forEach((button, index) => {
      button.addEventListener("click", () => {
        track("cta_opened", { cta_location: button.dataset.trackCta || `cta_${index + 1}` }, true);
      });
    });

    document.querySelectorAll("[data-age-link]").forEach((link) => {
      link.addEventListener("click", () => {
        const ageGroup = link.dataset.ageGroup || "";
        const ctaLocation = link.closest("[data-age-modal]")?.dataset.lastCta || "age_modal";
        track("age_selected", { age_group: ageGroup, cta_location: ctaLocation });
        track("line_outbound", { age_group: ageGroup, cta_location: ctaLocation }, true);
      });
    });

    document.addEventListener("summitforge:diagnosis", (event) => {
      const detail = event.detail || {};
      const value = String(detail.value || "").slice(0, 50);
      if (detail.step === "started") {
        track("diagnosis_started", { cta_location: detail.cta_location || "form" }, true);
      } else if (detail.step === "stock") {
        diagnosisState.stock_code = value;
        track("diagnosis_stock_entered", { stock_code: value }, true);
      } else if (detail.step === "concern") {
        diagnosisState.concern = value;
        track("diagnosis_concern_selected", { concern: value }, true);
      } else if (detail.step === "age") {
        diagnosisState.age_group = value;
        track("diagnosis_age_selected", { age_group: value }, true);
      } else if (detail.step === "completed") {
        track("diagnosis_completed", { ...diagnosisState }, true);
        track("line_outbound", { ...diagnosisState, cta_location: "diagnosis_form" }, true);
      }
    });

    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-modal]") || event.target.matches("[data-age-modal]")) {
        track("modal_closed");
      }
      const opener = event.target.closest("[data-open-age-modal]");
      const modal = document.querySelector("[data-age-modal]");
      if (opener && modal) modal.dataset.lastCta = opener.dataset.trackCta || "unknown";
    });

    let scrollFrame = 0;
    addEventListener("scroll", () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        evaluateScroll();
      });
    }, { passive: true });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        updateVisibleTime();
        visibleSince = null;
      } else {
        visibleSince = performance.now();
      }
    });

    window.setInterval(() => {
      if (document.visibilityState === "visible") updateVisibleTime();
      const seconds = Math.floor(activeSeconds);
      for (const milestone of [30, 60, 120]) {
        if (seconds >= milestone && !engagementMilestones.has(milestone)) {
          engagementMilestones.add(milestone);
          track("engagement", { duration_seconds: milestone });
        }
      }
    }, 5000);

    addEventListener("pagehide", () => {
      if (document.visibilityState === "visible") updateVisibleTime();
      track("page_summary", {
        duration_seconds: Math.floor(activeSeconds),
        scroll_depth: maxScrollDepth,
      });
      flush(true);
    });

    evaluateScroll();
  };

  const startTracking = () => {
    if (trackerStarted) return;
    trackerStarted = true;
    bindInteractionTracking();
    if (session.isNew) track("session_start");
    track("page_view");
    loadHighEntropyDeviceDetails();
  };

  const removeNotice = () => document.querySelector("[data-tracking-notice]")?.remove();

  const showNotice = () => {
    removeNotice();
    const alreadyGranted = getConsent() === "granted";
    const notice = document.createElement("section");
    notice.className = "tracking-notice";
    notice.dataset.trackingNotice = "";
    notice.setAttribute("role", "region");
    notice.setAttribute("aria-labelledby", "tracking-notice-title");
    notice.innerHTML = `
      <div class="tracking-notice__inner">
        <div>
          <strong id="tracking-notice-title">アクセスデータの利用について</strong>
          <p>年代、入力内容、閲覧状況、アクセス元、IPアドレス、端末情報を、ご案内の改善と利用状況の分析に使用します。<a href="${config.privacyUrl || "../privacy.html"}">詳細を確認</a></p>
        </div>
        <div class="tracking-notice__actions">
          ${alreadyGranted ? '<button type="button" data-tracking-decline>同意を撤回</button>' : ""}
          <button type="button" class="tracking-notice__accept" data-tracking-accept>${alreadyGranted ? "設定を閉じる" : "同意して続ける"}</button>
        </div>
      </div>`;
    body.prepend(notice);
    notice.querySelector("[data-tracking-accept]").addEventListener("click", () => {
      storageSet(localStorage, CONSENT_KEY, "granted");
      removeNotice();
      startTracking();
    });
    notice.querySelector("[data-tracking-decline]")?.addEventListener("click", () => {
      storageSet(localStorage, CONSENT_KEY, "denied");
      queue.length = 0;
      window.clearTimeout(flushTimer);
      flushTimer = 0;
      removeNotice();
    });
  };

  document.querySelectorAll("[data-tracking-settings]").forEach((button) => {
    button.hidden = false;
    button.addEventListener("click", showNotice);
  });

  if (getConsent() === "granted") startTracking();
  else if (getConsent() !== "denied") showNotice();
})();
