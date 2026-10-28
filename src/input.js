// Keyboard controls.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  // True once per key press.
  took(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  endFrame() {
    this.pressed.clear();
  }

  riding() {
    return {
      throttle: this.down('KeyW') ? 1 : 0,
      brake: this.down('KeyS') ? 1 : 0,
      steer: (this.down('KeyD') ? 1 : 0) - (this.down('KeyA') ? 1 : 0),
      pitch: (this.down('ArrowUp') ? 1 : 0) - (this.down('ArrowDown') ? 1 : 0),
      hop: this.down('Space'),
    };
  }
}
