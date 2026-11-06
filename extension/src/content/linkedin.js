// LinkedIn content script: reads the open profile on demand (no background
// scraping, no crawling), and adds a floating "Add to SWFS" button on /in/ pages.
(() => {
  // No "already injected" guard: after an extension reload the old script's
  // listeners are dead, and the panel re-injects this file. Instead, clean up
  // any button a previous instance left behind.
  document.querySelectorAll('.swfs-fab').forEach((el) => el.remove());

  const PROFILE_RE = /^\/in\/([^/]+)\/?/;
  const isProfilePage = () => PROFILE_RE.test(location.pathname);
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Visible text lines of a list item, skipping nested items (LinkedIn duplicates text for screen readers). */
  function linesOf(li) {
    const out = [];
    li.querySelectorAll('span[aria-hidden="true"]').forEach((s) => {
      if (s.closest('li') !== li) return;
      const t = clean(s.textContent);
      if (t && !out.includes(t)) out.push(t);
    });
    return out;
  }

  function sectionById(id) {
    const anchor = document.getElementById(id);
    return anchor ? anchor.closest('section') : null;
  }

  function topItems(section) {
    if (!section) return [];
    const all = [...section.querySelectorAll('li')];
    // Top-level items: an <li> with no <li> ancestor inside this section.
    return all.filter((li) => {
      const parentLi = li.parentElement?.closest('li');
      return !parentLi || !section.contains(parentLi);
    });
  }

  const MONTHS = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
  const DATE_RANGE_RE = /((?:[A-Za-z]{3,9}\s+)?\d{4})\s*[-–]\s*(Present|(?:[A-Za-z]{3,9}\s+)?\d{4})/i;

  function toYm(s) {
    if (!s || /present/i.test(s)) return undefined;
    const m = s.match(/([A-Za-z]{3})[A-Za-z]*\s+(\d{4})/);
    if (m && MONTHS[m[1].toLowerCase()]) return `${m[2]}-${MONTHS[m[1].toLowerCase()]}`;
    const y = s.match(/\d{4}/);
    return y ? y[0] : undefined;
  }

  function parseRange(line) {
    const m = line && line.match(DATE_RANGE_RE);
    if (!m) return null;
    return { startDate: toYm(m[1]), endDate: toYm(m[2]), current: /present/i.test(m[2]) };
  }

  const companyOf = (line) => clean(String(line || '').split('·')[0]);

  // ---------------------------------------------------------------------------
  // Section parsers (best effort; the AI pass in the panel fills gaps)
  // ---------------------------------------------------------------------------

  function parseExperience() {
    const out = [];
    for (const li of topItems(sectionById('experience'))) {
      const lines = linesOf(li);
      if (!lines.length) continue;
      const nested = [...li.querySelectorAll('li')].filter((n) => n !== li && linesOf(n).length);
      const nestedWithDates = nested.filter((n) => linesOf(n).some((l) => DATE_RANGE_RE.test(l)));
      if (nestedWithDates.length) {
        // Grouped: several positions at one company.
        const company = lines[0];
        for (const n of nestedWithDates) {
          const nl = linesOf(n);
          const range = parseRange(nl.find((l) => DATE_RANGE_RE.test(l)));
          out.push({ company, title: nl[0], ...(range || {}) });
        }
      } else {
        const range = parseRange(lines.find((l) => DATE_RANGE_RE.test(l)));
        out.push({ title: lines[0], company: companyOf(lines[1]), ...(range || {}) });
      }
    }
    return out.filter((e) => e.company);
  }

  function parseEducation() {
    return topItems(sectionById('education'))
      .map((li) => {
        const lines = linesOf(li);
        if (!lines.length) return null;
        const [degree, ...field] = (lines[1] && !DATE_RANGE_RE.test(lines[1]) ? lines[1] : '').split(',');
        const years = (lines.find((l) => /\d{4}/.test(l)) || '').match(/\d{4}/g) || [];
        return {
          institution: lines[0],
          degree: clean(degree) || undefined,
          field: clean(field.join(',')) || undefined,
          startYear: years[0] ? Number(years[0]) : undefined,
          endYear: years[1] ? Number(years[1]) : undefined,
        };
      })
      .filter(Boolean);
  }

  const firstLines = (id) =>
    topItems(sectionById(id))
      .map((li) => linesOf(li)[0])
      .filter(Boolean);

  function parseCertifications() {
    return topItems(sectionById('licenses_and_certifications'))
      .map((li) => {
        const l = linesOf(li);
        return l[0] ? { name: l[0], issuer: l[1] && !/^issued/i.test(l[1]) ? l[1] : undefined } : null;
      })
      .filter(Boolean);
  }

  function parseAbout() {
    const sec = sectionById('about');
    if (!sec) return '';
    const spans = [...sec.querySelectorAll('span[aria-hidden="true"]')].map((s) => clean(s.textContent));
    return spans.sort((a, b) => b.length - a.length)[0] || '';
  }

  /** Total years from merged employment intervals (overlaps counted once). */
  function yearsFrom(history) {
    const toMonths = (ym, fallbackNow) => {
      if (!ym) return fallbackNow ? new Date().getFullYear() * 12 + new Date().getMonth() : null;
      const [y, m] = ym.split('-').map(Number);
      return y * 12 + ((m || 1) - 1);
    };
    const spans = history
      .map((e) => [toMonths(e.startDate), toMonths(e.endDate, e.current || !e.endDate)])
      .filter(([s, e]) => s != null && e != null && e >= s)
      .sort((a, b) => a[0] - b[0]);
    let total = 0;
    let cur = null;
    for (const [s, e] of spans) {
      if (!cur || s > cur[1]) {
        if (cur) total += cur[1] - cur[0];
        cur = [s, e];
      } else cur[1] = Math.max(cur[1], e);
    }
    if (cur) total += cur[1] - cur[0];
    return total ? Math.round((total / 12) * 10) / 10 : undefined;
  }

  // ---------------------------------------------------------------------------
  // Contact info overlay (email / phone / website). Only read when asked.
  // ---------------------------------------------------------------------------

  function readContactOverlay() {
    const scope = document.querySelector('.pv-contact-info, [class*="contact-info"]');
    if (!scope) return null;
    const sec = (label) => {
      for (const h of scope.querySelectorAll('h3,h2')) {
        if (clean(h.textContent).toLowerCase().startsWith(label)) return h.closest('section') || h.parentElement;
      }
      return null;
    };
    let email = '';
    const mail = scope.querySelector('a[href^="mailto:"]');
    if (mail) email = decodeURIComponent(mail.href.slice(7).split('?')[0]);
    if (!email) email = ((sec('email')?.innerText || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [''])[0];
    let phone = '';
    const tel = scope.querySelector('a[href^="tel:"]');
    if (tel) phone = decodeURIComponent(tel.href.slice(4).split('?')[0]);
    if (!phone) phone = clean(((sec('phone')?.innerText || '').match(/\+?[0-9][0-9()\-.\s]{6,}[0-9]/) || [''])[0]);
    let website = '';
    const ws = sec('website');
    const wl = ws?.querySelector('a[href]');
    if (wl) website = wl.href.split('?')[0];
    if (!website) {
      for (const a of scope.querySelectorAll('a[href^="http"]')) {
        if (!/linkedin\.com/i.test(a.href)) {
          website = a.href.split('?')[0];
          break;
        }
      }
    }
    return { email, phone, website };
  }

  async function fetchContactInfo() {
    let info = readContactOverlay();
    if (info) return info;
    const link = document.querySelector('a#top-card-text-details-contact-info, a[href*="/overlay/contact-info/"]');
    if (!link) return null;
    link.click();
    for (let i = 0; i < 20 && !info; i++) {
      await sleep(200);
      info = readContactOverlay();
    }
    // Close the overlay so the recruiter's page is left as it was.
    document.querySelector('.artdeco-modal button[aria-label="Dismiss"], button[aria-label="Dismiss"]')?.click();
    return info;
  }

  // ---------------------------------------------------------------------------
  // Main scrape
  // ---------------------------------------------------------------------------

  function photoUrl(name) {
    const candidates = [
      ...document.querySelectorAll(
        'main img.pv-top-card-profile-picture__image--show, main img.pv-top-card-profile-picture__image, main .pv-top-card__photo img, main img[class*="profile-picture"]'
      ),
    ];
    if (name) candidates.push(...[...document.querySelectorAll('main img')].filter((i) => clean(i.alt) === name));
    const img = candidates.find((i) => i.src && i.src.startsWith('https://media.licdn.com/') && !/ghost|static/i.test(i.src));
    return img ? img.src : undefined;
  }

  async function scrape({ withContact = false } = {}) {
    if (!isProfilePage()) return { ok: false, reason: 'not-profile' };
    const slug = location.pathname.match(PROFILE_RE)[1];
    const main = document.querySelector('main') || document.body;
    const h1 = main.querySelector('h1');
    const fullName = clean(h1?.textContent) || clean(document.title.replace(/\s*[|\-–]\s*LinkedIn.*$/i, '').replace(/^\(\d+\)\s*/, ''));
    const top = h1?.closest('section') || main;
    const headline = clean(top.querySelector('.text-body-medium.break-words, [data-generated-suggestion-target]')?.textContent);
    const location_ = clean(top.querySelector('.text-body-small.inline.t-black--light.break-words')?.textContent);
    const currentCompanyBtn = top.querySelector('button[aria-label^="Current company"], [aria-label^="Current company"]');
    const currentCompanyLabel = clean(currentCompanyBtn?.getAttribute('aria-label')?.replace(/^Current company:\s*/i, '').replace(/\.\s*Click.*$/i, ''));

    const employmentHistory = parseExperience();
    const education = parseEducation();
    const skills = firstLines('skills');
    const languages = firstLines('languages');
    const certifications = parseCertifications();
    const about = parseAbout();
    const current = employmentHistory.find((e) => e.current) || employmentHistory[0];

    const contact = withContact ? await fetchContactInfo() : readContactOverlay();

    const parts = fullName.split(' ');
    const profile = {
      linkedinUrl: `https://www.linkedin.com/in/${decodeURIComponent(slug)}/`,
      fullName,
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' ') || '',
      headline,
      location: location_,
      photoUrl: photoUrl(fullName),
      currentTitle: current?.title || (headline.split(/ at | @ /i)[0] || '').slice(0, 120),
      currentCompany: currentCompanyLabel || current?.company || (headline.split(/ at | @ /i)[1] || '').trim(),
      currentlyWorking: current ? !!current.current : undefined,
      about,
      employmentHistory,
      education,
      skills,
      languages,
      certifications,
      yearsExperience: yearsFrom(employmentHistory),
      email: contact?.email || '',
      phone: contact?.phone || '',
      website: contact?.website || '',
      contactFetched: !!contact,
    };

    // Plain-text résumé for the AI extractor (it handles layouts the DOM parser can't).
    const sectionText = (id, label) => {
      const s = sectionById(id);
      if (!s) return '';
      const lines = [];
      s.querySelectorAll('span[aria-hidden="true"]').forEach((sp) => {
        const t = clean(sp.textContent);
        if (t && lines[lines.length - 1] !== t) lines.push(t);
      });
      return lines.length ? `\n${label}\n${lines.join('\n')}` : '';
    };
    profile.text = [
      fullName,
      headline,
      location_,
      about && `\nAbout\n${about}`,
      sectionText('experience', 'Experience'),
      sectionText('education', 'Education'),
      sectionText('licenses_and_certifications', 'Certifications'),
      sectionText('skills', 'Skills'),
      sectionText('languages', 'Languages'),
      profile.email && `Email: ${profile.email}`,
      profile.phone && `Phone: ${profile.phone}`,
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, 20000);

    return { ok: true, profile };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'scrape') {
      scrape(msg).then(sendResponse, (err) => sendResponse({ ok: false, reason: 'error', error: String(err?.message || err) }));
      return true;
    }
    if (msg?.type === 'ping') {
      sendResponse({ ok: true, profile: isProfilePage() });
      return false;
    }
    return false;
  });

  // ---------------------------------------------------------------------------
  // Floating button
  // ---------------------------------------------------------------------------

  let fab = null;

  function ensureFab(show) {
    if (!show) {
      fab?.remove();
      fab = null;
      return;
    }
    if (fab) return;
    fab = document.createElement('button');
    fab.className = 'swfs-fab';
    fab.type = 'button';
    fab.title = 'Add this profile to SWFS';
    const img = document.createElement('img');
    img.src = chrome.runtime.getURL('icons/icon32.png');
    img.alt = '';
    const label = document.createElement('span');
    label.textContent = 'Add to SWFS';
    fab.append(img, label);
    fab.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'open-panel' }).catch(() => {});
    });
    document.body.appendChild(fab);
  }

  async function refreshFab() {
    let enabled = true;
    try {
      const { settings } = await chrome.storage.sync.get('settings');
      enabled = settings?.floatingButton !== false;
    } catch {
      /* extension reloaded — keep default */
    }
    ensureFab(enabled && isProfilePage());
  }

  // LinkedIn is a single-page app: watch for URL changes.
  let lastPath = location.pathname;
  const timer = setInterval(() => {
    if (!chrome.runtime?.id) {
      // Extension was reloaded or removed: this instance is orphaned.
      clearInterval(timer);
      fab?.remove();
      return;
    }
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      refreshFab();
    }
  }, 800);
  chrome.storage.onChanged.addListener((changes, area) => area === 'sync' && changes.settings && refreshFab());
  refreshFab();
})();
