// Quick chat for two-player games. Enter opens a one-line box, Enter again
// sends, Esc (or clicking away) cancels. Lines show as speech bubbles over
// the sender's chef (see Overlay.say) for CHAT_SECONDS.
export const CHAT_MAX = 80;
export const CHAT_SECONDS = 5;

/** One tidy line: no control characters, collapsed spaces, capped length. */
export function cleanChat(text) {
  return String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
}

export class ChatBox {
  constructor(root, onSend) {
    this.onSend = onSend;
    this.el = document.createElement('form');
    this.el.className = 'chat-box';
    this.el.hidden = true;
    this.el.innerHTML = `<label class="chat-label" for="chat-input">Say</label>`
      + `<input id="chat-input" maxlength="${CHAT_MAX}" autocomplete="off" spellcheck="false" placeholder="Message your partner…">`
      + `<span class="chat-hint"><kbd>Enter</kbd> send · <kbd>Esc</kbd> cancel</span>`;
    this.input = this.el.querySelector('input');
    root.appendChild(this.el);
    this.el.addEventListener('submit', (e) => { e.preventDefault(); this.send(); });
    this.input.addEventListener('blur', () => { if (this.open) this.close(); });
  }

  get open() { return !this.el.hidden; }

  show() {
    this.el.hidden = false;
    this.input.value = '';
    this.input.focus();
  }

  close() {
    this.el.hidden = true;
    this.input.value = '';
    if (document.activeElement === this.input) this.input.blur();
  }

  send() {
    const text = cleanChat(this.input.value);
    this.close();
    if (text) this.onSend(text);
  }
}
