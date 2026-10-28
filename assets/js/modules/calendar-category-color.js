// Category backgrounds may be a solid color or explicitly absent.
export const NO_CATEGORY_COLOR = 'transparent';

export function normalizeCategoryColor(value, fallback = '#eaffd7') {
  const color = String(value || '').trim().toLowerCase();
  return color === NO_CATEGORY_COLOR || /^#[0-9a-f]{6}$/.test(color) ? color : fallback;
}

export function readCategoryColor(input) {
  return input.dataset.noColor === 'true' ? NO_CATEGORY_COLOR : normalizeCategoryColor(input.value);
}

export function setCategoryColor(input, value) {
  const color = normalizeCategoryColor(value);
  input.dataset.noColor = String(color === NO_CATEGORY_COLOR);
  // A native color input cannot hold transparent. Keep its last solid color.
  if (color !== NO_CATEGORY_COLOR) input.value = color;
  input.title = color === NO_CATEGORY_COLOR ? '색 없음' : '카테고리 색상 선택';
}

const initializedInputs = new WeakSet();

export function initCategoryColorInput(input, value = readCategoryColor(input)) {
  setCategoryColor(input, value);
  if (initializedInputs.has(input)) return;
  initializedInputs.add(input);
  // Keep the browser/OS color picker as the direct click action.
  input.addEventListener('input', () => setCategoryColor(input, input.value));
}

export function createCategoryNoColorButton(input, { onChange = () => {} } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'calendar-category-no-color';
  button.textContent = '색 없음';
  const sync = () => {
    const color = readCategoryColor(input);
    button.setAttribute('aria-pressed', String(color === NO_CATEGORY_COLOR));
    onChange(color);
  };
  button.addEventListener('click', () => {
    // Toggling off restores the last solid color, including the same native color.
    setCategoryColor(input, readCategoryColor(input) === NO_CATEGORY_COLOR ? input.value : NO_CATEGORY_COLOR);
    sync();
  });
  input.addEventListener('input', sync);
  sync();
  return button;
}
