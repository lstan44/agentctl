const copyScopes = document.querySelectorAll("[data-copy-scope]");

for (const scope of copyScopes) {
  const button = scope.querySelector("[data-copy-button]");
  const value = scope.querySelector("[data-copy-value]");
  const label = scope.querySelector("[data-copy-label]");
  const status = scope.querySelector("[data-copy-status]");

  if (!button || !value || !label || !status) continue;

  button.addEventListener("click", async () => {
    const command = value.textContent.trim();
    try {
      await navigator.clipboard.writeText(command);
      label.textContent = "Copied";
      status.textContent = "Install command copied. Paste it into a terminal when ready.";
      button.dataset.state = "success";
    } catch {
      label.textContent = "Select";
      status.textContent = "Clipboard access was unavailable. Select and copy the command manually.";
      button.dataset.state = "error";
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(value);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    window.setTimeout(() => {
      label.textContent = "Copy";
      delete button.dataset.state;
    }, 2800);
  });
}
