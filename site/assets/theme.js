(function () {
  "use strict";
  var STORAGE_KEY = "theme";
  var root = document.documentElement;
  var button = document.querySelector(".theme-toggle");
  if (!button) return;

  function current() {
    return root.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  button.addEventListener("click", function () {
    var next = current() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch (error) {
      // Private browsing / storage disabled — theme just won't persist across visits.
    }
  });
})();
