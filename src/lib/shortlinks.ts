// Company short links written as plain text: "go/some-name", "b/1234567" and "b/hotlists/1234567".
// They are shown as links and open in the browser, but the text in the note is never changed.

/** Switched from Settings → Editor. */
export const shortLinks = { on: true }

// Not part of a longer word, path or web address on either side.
const PATTERN = String.raw`(?<![\w/.:@#-])(?:b/(?:hotlists/)?\d+|go/[A-Za-z0-9][\w-]*(?:/[\w-]+)*)(?![\w/])`

/** A fresh matcher each time, since a global regular expression remembers where it stopped. */
export const shortLinkPattern = () => new RegExp(PATTERN, 'g')

/** Where a short link goes. The browser resolves "go" and "b" on the company network. */
export const shortLinkHref = (text: string) => `http://${text}`
