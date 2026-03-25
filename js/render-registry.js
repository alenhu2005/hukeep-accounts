/** Set once from main to avoid circular imports (navigation ↔ views ↔ router). */
let renderImpl = () => {};

export function setRender(fn) {
  renderImpl = fn;
}

export function render() {
  renderImpl();
}
