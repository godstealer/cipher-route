// Extension options may run in a browser tab; tab presence is not an origin check.
export function trustedMessageSource(sender, runtime) {
  if (sender?.id !== runtime.id || typeof sender.url !== 'string') return false;
  try {
    const url = new URL(sender.url);
    url.search = ''; url.hash = '';
    return ['options.html', 'popup.html'].some(page => url.href === runtime.getURL(page));
  } catch { return false; }
}
