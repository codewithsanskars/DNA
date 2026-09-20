// Notice period is always a whole number of days.
export const isValidNoticePeriod = (value: string): boolean => {
  if (!value.trim()) return true;
  const num = Number(value);
  return Number.isInteger(num) && num >= 0;
};

// Same pattern the browser's own `type="email"` validation uses (the
// WHATWG HTML spec's email regex) — kept here so it can also be enforced
// on submit, since a native `type="email"` input only blocks the browser's
// own submit button and does nothing for a programmatic form submission.
const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export const isValidEmail = (value: string): boolean => EMAIL_RE.test(value.trim());

// For an optional email field, an empty value is valid — only a non-empty
// one has to look like a real address.
export const isValidOptionalEmail = (value: string): boolean => !value.trim() || isValidEmail(value);
