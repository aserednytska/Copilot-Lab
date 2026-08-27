document.querySelectorAll('.copy-button').forEach((button) => {
  button.addEventListener('click', async () => {
    const code = button.closest('.prompt-block')?.querySelector('code');
    if (!code) return;

    const original = button.textContent;
    try {
      await navigator.clipboard.writeText(code.textContent.trim());
      button.textContent = 'Copied';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = 'Select text';
    }

    window.setTimeout(() => {
      button.textContent = original;
    }, 1800);
  });
});

