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
  const dock = document.querySelector('.dock');
  const cover = document.querySelector('.opening');
  const packages = document.querySelector('.packages');
  if (dock && cover && packages && 'IntersectionObserver' in window) {
    const state = { cover: true, packages: false };
    const update = () => dock.classList.toggle('is-away', state.cover || state.packages);
    update();
    const watch = (el, key, test) => new window.IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      state[key] = test(e);
      update();
    }).observe(el);
    watch(cover, 'cover', (e) => e.isIntersecting);
    watch(packages, 'packages', (e) => e.isIntersecting || e.boundingClientRect.top < 0);
  }
})();
