// Applies the saved theme before first paint so light-theme users do not see a dark flash.
try {
  var saved = JSON.parse(localStorage.getItem("sb-theme") || "{}");
  if (saved.state && saved.state.theme === "light") document.documentElement.classList.remove("dark");
} catch (e) {}
