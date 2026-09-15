(() => {
  "use strict";

  const LINE_URL = "https://line.me/ti/p/RTSB_TkeeW";
  const THIRTY_MINUTES = 30 * 60 * 1000;
  const body = document.body;
  const campaignId = body.dataset.campaign || "summitforge";
  const modal = document.querySelector("[data-age-modal]");
  const openers = Array.from(document.querySelectorAll("[data-open-age-modal]"));
  const closeButton = modal?.querySelector("[data-close-modal]");
  const ageLinks = modal ? Array.from(modal.querySelectorAll("[data-age-link]")) : [];
  let lastFocused = null;

  ageLinks.forEach((link) => {
    link.href = LINE_URL;
  });

  const getFocusable = () => {
    if (!modal) return [];
    return Array.from(
      modal.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
  };

  const openModal = (trigger) => {
    if (!modal) return;
    lastFocused = trigger;
    modal.hidden = false;
    body.classList.add("modal-open");
    closeButton?.focus();
  };

  const closeModal = () => {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    body.classList.remove("modal-open");
    lastFocused?.focus();
  };

  openers.forEach((opener) => {
    opener.addEventListener("click", () => openModal(opener));
  });

  closeButton?.addEventListener("click", closeModal);

  modal?.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (!modal || modal.hidden) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = getFocusable();
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const storageKey = `lpCountdown:${campaignId}`;
  let endTime;

  try {
    const stored = Number(sessionStorage.getItem(storageKey));
    if (Number.isFinite(stored) && stored > 0) {
      endTime = stored;
    } else {
      endTime = Date.now() + THIRTY_MINUTES;
      sessionStorage.setItem(storageKey, String(endTime));
    }
  } catch (_error) {
    endTime = Date.now() + THIRTY_MINUTES;
  }

  const timers = Array.from(document.querySelectorAll("[data-countdown]"));
  const timerLabels = Array.from(document.querySelectorAll("[data-timer-label]"));
  const expiryCopies = Array.from(document.querySelectorAll("[data-expiry-copy]"));
  let expired = false;

  const renderCountdown = () => {
    const remaining = Math.max(0, endTime - Date.now());
    const totalSeconds = Math.ceil(remaining / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const display = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    timers.forEach((timer) => {
      timer.textContent = display;
    });

    if (remaining === 0 && !expired) {
      expired = true;
      timerLabels.forEach((label) => {
        label.textContent = "受付終了間近";
      });
      expiryCopies.forEach((copy) => {
        copy.textContent = "受付終了間近｜今すぐLINEで確認";
      });
    }
  };

  renderCountdown();
  window.setInterval(renderCountdown, 1000);
})();
