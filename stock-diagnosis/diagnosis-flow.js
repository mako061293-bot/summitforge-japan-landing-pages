(() => {
  "use strict";

  const form = document.querySelector("[data-diagnosis-flow]");
  if (!form) return;

  const panels = Array.from(form.querySelectorAll("[data-step-panel]"));
  const indicators = Array.from(form.querySelectorAll("[data-step-indicator]"));
  const stockInput = form.querySelector("[data-stock-input]");
  const errorMessages = Array.from(form.querySelectorAll("[data-error-for]"));
  const summaryFields = {
    stock: form.querySelector('[data-summary="stock"]'),
    concern: form.querySelector('[data-summary="concern"]'),
    age: form.querySelector('[data-summary="age"]'),
  };
  const submitLink = form.querySelector("[data-diagnosis-submit]");
  const state = { stock: "", concern: "", concernLabel: "", age: "", ageLabel: "" };

  const announce = (step, value) => {
    document.dispatchEvent(new CustomEvent("summitforge:diagnosis", {
      detail: { step, value: value || "" },
    }));
  };

  const showError = (field, visible) => {
    const message = errorMessages.find((item) => item.dataset.errorFor === field);
    if (message) message.hidden = !visible;
  };

  const updateProgress = (step) => {
    indicators.forEach((indicator) => {
      const index = Number(indicator.dataset.stepIndicator);
      indicator.classList.toggle("is-current", index === step);
      indicator.classList.toggle("is-done", index < step);
      indicator.setAttribute("aria-current", index === step ? "step" : "false");
    });
  };

  const renderSummary = () => {
    summaryFields.stock.textContent = state.stock || "—";
    summaryFields.concern.textContent = state.concernLabel || "—";
    summaryFields.age.textContent = state.ageLabel || "—";
  };

  const showStep = (step, { focus = true } = {}) => {
    panels.forEach((panel) => {
      panel.hidden = Number(panel.dataset.stepPanel) !== step;
    });
    updateProgress(step);
    if (!focus) return;
    const panel = panels.find((item) => Number(item.dataset.stepPanel) === step);
    const target = panel?.querySelector("input, .diag-option, a.cta-button, button.cta-button");
    if (target) {
      target.focus({ preventScroll: true });
      panel.scrollIntoView({ block: "center", behavior: matchesMediaReduce() ? "auto" : "smooth" });
    }
  };

  function matchesMediaReduce() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  }

  const selectOption = (button, group) => {
    const attribute = group === "concern" ? "concernOption" : "ageOption";
    const siblings = form.querySelectorAll(group === "concern" ? "[data-concern-option]" : "[data-age-option]");
    siblings.forEach((sibling) => {
      const selected = sibling === button;
      sibling.classList.toggle("is-selected", selected);
      sibling.setAttribute("aria-checked", selected ? "true" : "false");
    });
    const label = button.querySelector("strong")?.textContent.trim() || "";
    if (group === "concern") {
      state.concern = button.dataset[attribute] || "";
      state.concernLabel = label;
      showError("concern", false);
      announce("concern", state.concern);
    } else {
      state.age = button.dataset[attribute] || "";
      state.ageLabel = label;
      showError("age", false);
      announce("age", state.age);
    }
  };

  form.querySelectorAll("[data-concern-option]").forEach((button) => {
    button.addEventListener("click", () => selectOption(button, "concern"));
  });

  form.querySelectorAll("[data-age-option]").forEach((button) => {
    button.addEventListener("click", () => selectOption(button, "age"));
  });

  form.querySelectorAll("[role='radiogroup']").forEach((group) => {
    group.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) return;
      const options = Array.from(group.querySelectorAll(".diag-option"));
      const current = options.indexOf(document.activeElement);
      if (current < 0) return;
      event.preventDefault();
      const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
      const next = (current + (forward ? 1 : -1) + options.length) % options.length;
      options[next].focus();
    });
  });

  form.querySelectorAll("[data-next-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = Number(button.dataset.nextStep);

      if (target === 2) {
        state.stock = stockInput.value.trim().replace(/\s+/g, " ").slice(0, 40);
        const valid = state.stock.length >= 2;
        showError("stock", !valid);
        if (!valid) {
          stockInput.focus();
          return;
        }
        announce("stock", state.stock);
      }

      if (target === 3 && !state.concern) {
        showError("concern", true);
        return;
      }

      if (target === 4) {
        if (!state.age) {
          showError("age", true);
          return;
        }
        renderSummary();
      }

      showStep(target);
    });
  });

  form.querySelectorAll("[data-previous-step]").forEach((button) => {
    button.addEventListener("click", () => showStep(Number(button.dataset.previousStep)));
  });

  stockInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    form.querySelector('[data-next-step="2"]')?.click();
  });

  submitLink?.addEventListener("click", () => {
    announce("completed", state.stock);
  });

  document.querySelectorAll("[data-open-diagnosis-flow]").forEach((button) => {
    button.addEventListener("click", () => {
      announce("started", button.dataset.trackCta || "form");
      showStep(1);
      stockInput?.focus({ preventScroll: true });
    });
  });

  showStep(1, { focus: false });
})();
