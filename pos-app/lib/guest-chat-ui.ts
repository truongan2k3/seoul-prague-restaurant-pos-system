/** Tiny bus so marketing overlays (menu book) can hide Guest Chat while open,
 *  and other pages can open Chat With Us (e.g. large-party reservation CTA).
 */

type HiddenListener = (hidden: boolean) => void;
type OpenListener = () => void;

const hiddenListeners = new Set<HiddenListener>();
const openListeners = new Set<OpenListener>();
let menuBookOpen = false;

export function setGuestChatHiddenForMenuBook(hidden: boolean) {
  menuBookOpen = hidden;
  for (const listener of hiddenListeners) listener(hidden);
}

export function subscribeGuestChatHiddenForMenuBook(listener: HiddenListener): () => void {
  hiddenListeners.add(listener);
  listener(menuBookOpen);
  return () => {
    hiddenListeners.delete(listener);
  };
}

/** Open the floating Guest Chat panel from elsewhere on the page. */
export function openGuestChat() {
  for (const listener of openListeners) listener();
}

export function subscribeOpenGuestChat(listener: OpenListener): () => void {
  openListeners.add(listener);
  return () => {
    openListeners.delete(listener);
  };
}
