(() => {
  const body = document.body;
  const until = body.dataset.validUntil;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (until && today > until) {
    body.classList.add('is-expired');
    const banner = document.querySelector('.expired');
    if (banner) banner.hidden = false;
  }
  for (const button of document.querySelectorAll('.save-pdf')) {
    button.hidden = false;
    button.addEventListener('click', () => window.print());
  }
})();
