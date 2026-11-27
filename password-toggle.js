(function () {
  function addPasswordVisibilityControls() {
    document.querySelectorAll('input[type="password"]').forEach(function (input) {
      if (input.dataset.visibilityControlAdded === "true") return;
      input.dataset.visibilityControlAdded = "true";

      var wrapper = document.createElement("span");
      wrapper.className = "password-field-wrap";
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);

      var toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "password-visibility-toggle";
      toggle.textContent = "Show";
      toggle.setAttribute("aria-label", "Show password");
      toggle.setAttribute("aria-pressed", "false");

      toggle.addEventListener("click", function () {
        var showing = input.type === "password";
        input.type = showing ? "text" : "password";
        toggle.textContent = showing ? "Hide" : "Show";
        toggle.setAttribute("aria-label", showing ? "Hide password" : "Show password");
        toggle.setAttribute("aria-pressed", showing ? "true" : "false");
      });

      wrapper.appendChild(toggle);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addPasswordVisibilityControls);
  } else {
    addPasswordVisibilityControls();
  }
})();