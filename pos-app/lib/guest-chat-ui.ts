/** Tiny bus so marketing overlays (menu book) can hide Guest Chat While open. */

type Listener = (hidden: boolean) => void;

const listeners = new Set<Listener>();
let menuBookOpen = false;

export function setGuestChatHiddenForMenuBook(hidden: boolean) {
  menuBookOpen = hidden;
  for (const listener of listeners) listener(hidden);
}

export function subscribeGuestChatHiddenForMenuBook(listener: Listener): () => void {
  listeners.add(listener);
  listener(menuBookOpen);
  return () => {
    listeners.delete(listener);
  };
}
