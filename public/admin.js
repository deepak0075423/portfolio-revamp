(() => {
  function nextIndex(container) {
    const items = container.querySelectorAll('.repeat-item');
    return items.length;
  }

  function addRepeatItem(key) {
    const container = document.querySelector(`[data-repeat="${CSS.escape(key)}"]`);
    const template = document.querySelector(`template[data-repeat-template="${CSS.escape(key)}"]`);
    if (!container || !template) return;

    const idx = nextIndex(container);
    const html = template.innerHTML.replaceAll('__INDEX__', String(idx));
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html.trim();
    const node = wrapper.firstElementChild;
    if (!node) return;
    container.appendChild(node);
  }

  document.addEventListener('click', (e) => {
    const addBtn = e.target.closest('[data-repeat-add]');
    if (addBtn) {
      const key = addBtn.getAttribute('data-repeat-add');
      if (key) addRepeatItem(key);
      return;
    }

    const removeBtn = e.target.closest('[data-repeat-remove]');
    if (removeBtn) {
      const item = removeBtn.closest('.repeat-item');
      if (item) item.remove();
    }
  });
})();

