import { api, AuthError, portalLink } from '../lib/api.js';
import { getAuth, getSettings, originOf, isBuiltInOrigin, getRecent, pushRecent, clearAuth } from '../lib/config.js';
import { h, icon, initials, toast, setIcon } from './ui.js';

const $app = document.getElementById('app');
const $bar = document.getElementById('actionbar');
const $who = document.getElementById('who');

setIcon(document.getElementById('settings'), 'settings');
setIcon(document.getElementById('refresh'), 'refresh');
document.getElementById('settings').onclick = () => chrome.runtime.openOptionsPage();
document.getElementById('refresh').onclick = () => loadContext(true);

const PROFILE_RE = /^https:\/\/www\.linkedin\.com\/in\/([^/?#]+)/;

/** Everything the panel shows. Rendering is a pure function of this. */
const state = {
  settings: null,
  auth: null,
  ai: null, // { available, model, provider }
  view: 'loading', // loading | connect | idle | profile | saved | error
  tabId: null,
  slug: null,
  profile: null, // raw scrape
  form: null, // editable values
  enrich: 'idle', // idle | running | done | failed | off
  dupes: null, // null = checking
  jobs: null,
  orgs: {},
  jobId: '',
  match: null, // { loading } | MatchBreakdown
  contact: 'idle', // idle | running | done | none
  saving: false,
  saved: null, // { id, name, linkedToRole }
  error: '',
};

// ---------------------------------------------------------------------------
// Boot + context
// ---------------------------------------------------------------------------

async function boot() {
  state.settings = await getSettings();
  state.auth = await getAuth();
  renderWho();
  if (!state.auth) {
    state.view = 'connect';
    return render();
  }
  api
    .aiStatus()
    .then((s) => (state.ai = s))
    .catch(() => (state.ai = { available: false }))
    .finally(() => state.view === 'profile' && render());
  loadJobs();
  await loadContext();
}

async function loadContext(force = false) {
  if (!state.auth) return boot();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const m = tab?.url?.match(PROFILE_RE);
  if (!m) {
    state.view = 'idle';
    state.slug = null;
    return render();
  }
  if (!force && state.slug === m[1] && (state.view === 'profile' || state.view === 'saved')) return;
  state.tabId = tab.id;
  state.slug = m[1];
  state.view = 'loading';
  render();
  await scrape(false);
}

async function sendToTab(msg) {
  try {
    return await chrome.tabs.sendMessage(state.tabId, msg);
  } catch {
    // Tab was open before the extension loaded: inject the content script and retry.
    await chrome.scripting.insertCSS({ target: { tabId: state.tabId }, files: ['src/content/linkedin.css'] }).catch(() => {});
    await chrome.scripting.executeScript({ target: { tabId: state.tabId }, files: ['src/content/linkedin.js'] });
    return chrome.tabs.sendMessage(state.tabId, msg);
  }
}

async function scrape(withContact) {
  let res;
  try {
    // LinkedIn renders sections lazily; give the page a moment on first load.
    res = await sendToTab({ type: 'scrape', withContact });
    if (res?.ok && !res.profile.employmentHistory.length && !withContact) {
      await new Promise((r) => setTimeout(r, 1200));
      res = await sendToTab({ type: 'scrape', withContact });
    }
  } catch (err) {
    state.view = 'error';
    state.error = 'Couldn’t read this page. Reload the LinkedIn tab and try again.';
    return render();
  }
  if (!res?.ok) {
    state.view = 'idle';
    return render();
  }
  setProfile(res.profile);
}

function splitName(full) {
  const name = String(full || '')
    .split(',')[0] // "Jane Doe, MBA"
    .replace(/[^\p{L}\p{M}\s'.-]/gu, '')
    .trim();
  const parts = name.split(/\s+/);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
}

function setProfile(p) {
  const { firstName, lastName } = splitName(p.fullName);
  state.profile = p;
  state.form = {
    firstName,
    lastName,
    currentTitle: p.currentTitle || '',
    currentCompany: p.currentCompany || '',
    location: p.location || '',
    email: p.email || '',
    phone: p.phone || '',
    website: p.website || '',
    yearsExperience: p.yearsExperience != null ? String(p.yearsExperience) : '',
    skills: [...p.skills],
    employmentHistory: p.employmentHistory,
    education: p.education,
    certifications: p.certifications,
    languages: p.languages,
    tags: state.settings.defaultTags || '',
    note: '',
  };
  state.aiFilled = new Set();
  state.view = 'profile';
  state.saved = null;
  state.dupes = null;
  state.match = null;
  state.contact = p.contactFetched ? 'done' : 'idle';
  state.enrich = state.settings.aiEnrich ? 'running' : 'off';
  render();
  checkDuplicates();
  if (state.settings.aiEnrich) enrichWithAi();
  if (state.jobId) refreshMatch();
}

// ---------------------------------------------------------------------------
// Async work
// ---------------------------------------------------------------------------

async function guard(fn, onError) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AuthError) {
      state.auth = null;
      state.view = 'connect';
      renderWho();
      render();
      toast(err.message, true);
      return undefined;
    }
    onError?.(err);
    return undefined;
  }
}

async function loadJobs() {
  await guard(async () => {
    const [jobs, orgs] = await Promise.all([api.jobs(), api.organizations().catch(() => [])]);
    state.orgs = Object.fromEntries((orgs || []).map((o) => [o._id, o.name]));
    state.jobs = (jobs || []).filter((j) => j.status === 'OPEN').sort((a, b) => a.title.localeCompare(b.title));
    if (state.view === 'profile') render();
  });
}

async function checkDuplicates() {
  const f = state.form;
  const slug = state.slug;
  await guard(
    async () => {
      const dupes = await api.duplicates({
        linkedinUrl: state.profile.linkedinUrl,
        email: f.email || undefined,
        phone: f.phone || undefined,
        firstName: f.firstName,
        lastName: f.lastName,
      });
      if (slug !== state.slug) return;
      state.dupes = dupes || [];
      render();
    },
    () => {
      state.dupes = [];
      render();
    }
  );
}

async function enrichWithAi() {
  const slug = state.slug;
  await guard(
    async () => {
      const ai = await api.parseProfileText(state.profile.text);
      if (slug !== state.slug || !state.form) return;
      const f = state.form;
      const fill = (key, value) => {
        if (value && !String(f[key] || '').trim()) {
          f[key] = String(value);
          state.aiFilled.add(key);
        }
      };
      fill('currentTitle', ai.currentTitle);
      fill('currentCompany', ai.currentCompany);
      fill('location', ai.location);
      fill('email', ai.email);
      fill('phone', ai.phone);
      fill('website', ai.website);
      if (!f.yearsExperience && ai.yearsExperience != null) fill('yearsExperience', ai.yearsExperience);
      // Structured lists: take the AI's when it found more than the DOM parser.
      for (const key of ['employmentHistory', 'education', 'certifications', 'languages']) {
        if ((ai[key] || []).length > (f[key] || []).length) {
          f[key] = ai[key];
          state.aiFilled.add(key);
        }
      }
      const seen = new Set(f.skills.map((s) => s.toLowerCase()));
      const extra = (ai.skills || []).filter((s) => !seen.has(s.toLowerCase()));
      if (extra.length) {
        f.skills = [...f.skills, ...extra].slice(0, 40);
        state.aiFilled.add('skills');
      }
      if (ai.summary && !f.note) f.aiSummary = ai.summary;
      state.enrich = 'done';
      render();
      if (state.jobId) refreshMatch();
    },
    () => {
      state.enrich = 'failed';
      render();
    }
  );
}

async function refreshMatch() {
  if (!state.jobId) {
    state.match = null;
    return render();
  }
  state.match = { loading: true };
  render();
  const f = state.form;
  await guard(
    async () => {
      state.match = await api.matchPreview(state.jobId, {
        currentTitle: f.currentTitle,
        location: f.location,
        skills: f.skills,
        yearsExperience: f.yearsExperience ? Number(f.yearsExperience) : undefined,
        employmentHistory: f.employmentHistory,
      });
      render();
    },
    () => {
      state.match = null;
      render();
    }
  );
}

async function fetchContact() {
  state.contact = 'running';
  render();
  const res = await sendToTab({ type: 'scrape', withContact: true }).catch(() => null);
  const p = res?.profile;
  if (!p || (!p.email && !p.phone && !p.website)) {
    state.contact = 'none';
    toast('No contact info is visible to you on this profile.');
    return render();
  }
  const f = state.form;
  if (p.email && !f.email) f.email = p.email;
  if (p.phone && !f.phone) f.phone = p.phone;
  if (p.website && !f.website) f.website = p.website;
  state.contact = 'done';
  render();
  checkDuplicates();
}

/** LinkedIn photo → JPEG blob (the portal accepts JPEG only). */
async function photoBlob(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('photo fetch failed');
  const blob = await res.blob();
  if (blob.type === 'image/jpeg') return blob;
  const bmp = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  canvas.getContext('2d').drawImage(bmp, 0, 0);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
}

const list = (s) =>
  String(s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

async function save() {
  const f = state.form;
  if (!f.firstName.trim() || !f.lastName.trim()) return toast('First and last name are required.', true);
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return toast('That email doesn’t look right.', true);
  state.saving = true;
  render();
  await guard(
    async () => {
      const years = Number(f.yearsExperience);
      const candidate = await api.createCandidate({
        firstName: f.firstName.trim(),
        lastName: f.lastName.trim(),
        email: f.email.trim() || undefined,
        phone: f.phone.trim() || undefined,
        currentlyWorking: state.profile.currentlyWorking,
        currentTitle: f.currentTitle.trim() || undefined,
        currentCompany: f.currentCompany.trim() || undefined,
        location: f.location.trim() || undefined,
        skills: f.skills,
        linkedinUrl: state.profile.linkedinUrl,
        website: f.website.trim() || undefined,
        notes: [f.note.trim(), state.profile.headline && `LinkedIn headline: ${state.profile.headline}`].filter(Boolean).join('\n\n') || undefined,
        source: 'LINKEDIN',
        jobId: state.jobId || undefined,
        tags: list(f.tags),
        yearsExperience: f.yearsExperience && Number.isFinite(years) ? years : undefined,
        employmentHistory: f.employmentHistory,
        education: f.education,
        certifications: f.certifications,
        languages: f.languages,
      });
      // Photo is a nice-to-have: never fail the capture over it.
      if (state.profile.photoUrl) {
        await photoBlob(state.profile.photoUrl)
          .then((b) => api.uploadPhoto(candidate._id, b))
          .catch(() => {});
      }
      const name = `${candidate.firstName} ${candidate.lastName}`;
      await pushRecent({ id: candidate._id, name, title: f.currentTitle, company: f.currentCompany });
      state.saved = { id: candidate._id, name, role: state.jobs?.find((j) => j._id === state.jobId)?.title };
      state.view = 'saved';
    },
    (err) => toast(err.message || 'Couldn’t save the candidate.', true)
  );
  state.saving = false;
  render();
}

async function linkExisting(dupe) {
  if (!state.jobId) return toast('Pick a role above first.', true);
  await guard(
    async () => {
      await api.linkJob(dupe._id, state.jobId);
      toast(`Added ${dupe.firstName} to the role.`);
    },
    (err) => toast(err.message, true)
  );
}

async function connect() {
  const { portalUrl } = state.settings;
  const origin = originOf(portalUrl);
  if (!origin) return chrome.runtime.openOptionsPage();
  if (!isBuiltInOrigin(origin)) {
    const ok = await chrome.permissions.request({ origins: [`${origin}/*`] });
    if (!ok) return toast('Permission is needed to connect to your portal.', true);
  }
  chrome.tabs.create({ url: `${portalUrl}/extension/connect` });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderWho() {
  $who.textContent = '';
  if (state.auth?.user?.email) {
    $who.append(h('span', { class: 'dot' }), state.auth.user.email);
    $who.title = `Connected to ${state.settings.portalUrl}`;
  } else $who.textContent = 'Not connected';
}

function render() {
  const focusId = document.activeElement?.id;
  const caret = document.activeElement?.selectionStart;
  $app.replaceChildren(...views[state.view]());
  renderActionBar();
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus();
      try {
        if (caret != null) el.setSelectionRange(caret, caret);
      } catch {
        /* selects don't support carets */
      }
    }
  }
}

function renderActionBar() {
  $bar.hidden = state.view !== 'profile';
  if (state.view !== 'profile') return;
  const exists = (state.dupes || []).length > 0;
  $bar.replaceChildren(
    h(
      'button',
      { class: 'btn primary lg block', disabled: state.saving, onclick: save },
      state.saving ? h('span', { class: 'spinner' }) : icon('plus'),
      state.saving ? 'Adding to SWFS…' : exists ? 'Add as new candidate anyway' : 'Add to SWFS'
    ),
    h(
      'p',
      { class: 'subtle', style: 'margin:0;text-align:center' },
      state.jobId ? `Will be linked to “${state.jobs?.find((j) => j._id === state.jobId)?.title ?? 'role'}” as Applied` : 'Added to the talent pool, source LinkedIn'
    )
  );
}

const views = {
  loading: () => [
    h(
      'div',
      { class: 'card card-pad' },
      h('div', { class: 'profile' }, h('div', { class: 'avatar skeleton' }), h('div', { class: 'grow' }, sk(160, 14), sk(220, 11, 8), sk(120, 10, 8)))
    ),
    h('div', { class: 'card card-pad' }, sk(90, 10), sk('100%', 30, 10), sk('100%', 30, 8)),
  ],

  connect: () => [
    h(
      'div',
      { class: 'card hero' },
      h('div', { class: 'glyph' }, icon('link')),
      h('h2', {}, 'Connect to your SWFS portal'),
      h('p', {}, 'Sign in once and add LinkedIn profiles to the talent database in one click.'),
      h(
        'ol',
        { class: 'steps' },
        step(1, 'Click Connect. The portal opens in a new tab.'),
        step(2, 'Sign in with your SWFS staff account.'),
        step(3, 'Come back to LinkedIn and open any profile.')
      ),
      h(
        'div',
        { class: 'stack' },
        h('button', { class: 'btn primary lg block', onclick: connect }, icon('link'), 'Connect to SWFS'),
        h('p', { class: 'subtle', style: 'margin:0' }, 'Portal: ', state.settings?.portalUrl || ''),
        h('button', { class: 'btn ghost sm', onclick: () => chrome.runtime.openOptionsPage() }, 'Change portal URL')
      )
    ),
  ],

  idle: () => {
    const wrap = [
      h(
        'div',
        { class: 'card hero' },
        h('div', { class: 'glyph' }, icon('user')),
        h('h2', {}, 'Open a LinkedIn profile'),
        h('p', {}, 'Go to any linkedin.com/in/… page. The profile is read and ready to add here.'),
        h(
          'div',
          { class: 'stack' },
          h(
            'button',
            { class: 'btn primary block', onclick: () => chrome.tabs.create({ url: 'https://www.linkedin.com/search/results/people/' }) },
            icon('search'),
            'Search people on LinkedIn'
          ),
          h('button', { class: 'btn block', onclick: async () => chrome.tabs.create({ url: await portalLink('/search') }) }, icon('external'), 'Open SWFS talent database')
        )
      ),
    ];
    const recentCard = h('div', { class: 'card', id: 'recent' });
    wrap.push(recentCard);
    getRecent().then(async (items) => {
      if (!items.length) return recentCard.remove();
      const links = await Promise.all(items.map((r) => portalLink(`/candidates/${r.id}`)));
      recentCard.replaceChildren(
        h('div', { class: 'card-pad', style: 'padding-bottom:4px' }, h('p', { class: 'section-title' }, 'Recently added')),
        h(
          'ul',
          { class: 'recent' },
          ...items.map((r, i) =>
            h(
              'li',
              {},
              h(
                'a',
                { href: links[i], target: '_blank' },
                h('span', { class: 'mini-avatar' }, initials(r.name)),
                h(
                  'span',
                  { class: 'grow' },
                  h('span', { class: 'truncate', style: 'display:block;font-weight:600' }, r.name),
                  h('span', { class: 'subtle truncate', style: 'display:block' }, [r.title, r.company].filter(Boolean).join(' · ') || '—')
                ),
                h('span', { class: 'subtle' }, timeAgo(r.at))
              )
            )
          )
        )
      );
    });
    return wrap;
  },

  error: () => [
    h(
      'div',
      { class: 'card hero' },
      h('div', { class: 'glyph' }, icon('alert')),
      h('h2', {}, 'Something went wrong'),
      h('p', {}, state.error),
      h('div', { class: 'stack' }, h('button', { class: 'btn primary block', onclick: () => loadContext(true) }, 'Try again'))
    ),
  ],

  saved: () => {
    const s = state.saved;
    return [
      h(
        'div',
        { class: 'card hero' },
        h('div', { class: 'glyph success' }, icon('check')),
        h('h2', {}, `${s.name} added to SWFS`),
        h('p', {}, s.role ? `Linked to “${s.role}” and saved to the talent pool.` : 'Saved to the talent pool with source LinkedIn.'),
        h(
          'div',
          { class: 'stack' },
          h('button', { class: 'btn primary block', onclick: async () => chrome.tabs.create({ url: await portalLink(`/candidates/${s.id}`) }) }, icon('external'), 'Open in SWFS'),
          h('button', { class: 'btn block', onclick: () => loadContext(true) }, 'Back to profile')
        )
      ),
    ];
  },

  profile: () => {
    const p = state.profile;
    const f = state.form;
    const out = [];

    // Header card
    const avatar = p.photoUrl
      ? h('img', { class: 'avatar', src: p.photoUrl, alt: '', referrerpolicy: 'no-referrer' })
      : h('div', { class: 'avatar' }, initials(p.fullName));
    out.push(
      h(
        'div',
        { class: 'card card-pad' },
        h(
          'div',
          { class: 'profile' },
          avatar,
          h(
            'div',
            { class: 'grow' },
            h('h1', {}, p.fullName || 'Unknown name'),
            p.headline && h('p', { class: 'headline' }, p.headline),
            h(
              'div',
              { class: 'meta' },
              p.location && h('span', {}, p.location),
              h('a', { href: p.linkedinUrl, target: '_blank' }, 'LinkedIn ↗'),
              f.yearsExperience && h('span', {}, `${f.yearsExperience} yrs exp`)
            )
          )
        ),
        h('div', { class: 'row', style: 'margin-top:10px;flex-wrap:wrap;gap:6px' }, enrichPill(), dupePill())
      )
    );

    // Duplicate banner
    if (state.dupes?.length) {
      const d = state.dupes[0];
      out.push(
        h(
          'div',
          { class: 'banner warning' },
          icon('alert'),
          h(
            'div',
            { class: 'grow' },
            h('strong', {}, `Already in SWFS: ${d.firstName} ${d.lastName}`),
            h('div', { class: 'muted' }, `Matched on ${(d.matchedOn || []).join(', ') || 'name'}${d.currentTitle ? ` · ${d.currentTitle}` : ''}`),
            h(
              'div',
              { class: 'actions' },
              h('button', { class: 'btn sm', onclick: async () => chrome.tabs.create({ url: await portalLink(`/candidates/${d._id}`) }) }, icon('external'), 'Open'),
              state.jobId && h('button', { class: 'btn sm primary', onclick: () => linkExisting(d) }, icon('plus'), 'Add existing to role')
            )
          )
        )
      );
    }

    // Role + match
    const roleSelect = h(
      'select',
      {
        class: 'select',
        id: 'role',
        onchange: (e) => {
          state.jobId = e.target.value;
          refreshMatch();
        },
      },
      h('option', { value: '' }, state.jobs ? 'No role (talent pool only)' : 'Loading roles…'),
      ...(state.jobs || []).map((j) =>
        h('option', { value: j._id, selected: j._id === state.jobId }, `${j.title}${state.orgs[j.organizationId] ? ` · ${state.orgs[j.organizationId]}` : ''}`)
      )
    );
    out.push(h('div', { class: 'card card-pad' }, h('p', { class: 'section-title' }, 'Add to role', h('span', { class: 'pill brand' }, icon('sparkles'), 'JD match')), roleSelect, matchView()));

    // Details
    out.push(
      details('Details', true, [
        h(
          'div',
          { class: 'grid2' },
          input('firstName', 'First name'),
          input('lastName', 'Last name'),
          input('currentTitle', 'Current title', true),
          input('currentCompany', 'Company'),
          input('location', 'Location'),
          input('yearsExperience', 'Years of experience'),
          input('tags', 'Tags', false, 'comma-separated')
        ),
      ])
    );

    // Contact
    out.push(
      details('Contact', true, [
        h('div', { class: 'grid2' }, input('email', 'Email', true), input('phone', 'Phone'), input('website', 'Website')),
        h(
          'button',
          { class: 'btn sm', style: 'margin-top:10px', disabled: state.contact === 'running', onclick: fetchContact },
          state.contact === 'running' ? h('span', { class: 'spinner' }) : icon('mail'),
          state.contact === 'done' ? 'Re-read contact info' : 'Fetch contact info from LinkedIn'
        ),
        h('p', { class: 'subtle', style: 'margin:6px 0 0' }, 'Opens the profile’s Contact info panel and reads only what LinkedIn shows you.'),
      ])
    );

    // Experience / education / skills
    if (f.employmentHistory.length)
      out.push(
        details(`Experience · ${f.employmentHistory.length}`, false, [
          h(
            'ul',
            { class: 'timeline' },
            ...f.employmentHistory.slice(0, 12).map((e) =>
              h(
                'li',
                { class: e.current ? 'current' : '' },
                h('span', { class: 'bullet' }),
                h(
                  'div',
                  {},
                  h('div', { class: 't1' }, [e.title, e.company].filter(Boolean).join(' · ')),
                  h('div', { class: 't2' }, [fmtYm(e.startDate), e.current ? 'Present' : fmtYm(e.endDate)].filter(Boolean).join(' – '))
                )
              )
            )
          ),
        ], state.aiFilled.has('employmentHistory'))
      );
    if (f.education.length)
      out.push(
        details(`Education · ${f.education.length}`, false, [
          h(
            'ul',
            { class: 'timeline' },
            ...f.education.map((e) =>
              h(
                'li',
                {},
                h('span', { class: 'bullet' }),
                h(
                  'div',
                  {},
                  h('div', { class: 't1' }, e.institution),
                  h('div', { class: 't2' }, [[e.degree, e.field].filter(Boolean).join(', '), [e.startYear, e.endYear].filter(Boolean).join(' – ')].filter(Boolean).join(' · '))
                )
              )
            )
          ),
        ], state.aiFilled.has('education'))
      );
    out.push(
      details(`Skills · ${f.skills.length}`, f.skills.length > 0 && f.skills.length <= 15, [
        f.skills.length
          ? h(
              'div',
              { class: 'chips' },
              ...f.skills.map((s) => {
                const matched = state.match?.matchedSkills?.some((m) => m.toLowerCase() === s.toLowerCase());
                return h(
                  'span',
                  { class: `chip ${matched ? 'ok' : ''}` },
                  s,
                  h(
                    'button',
                    {
                      class: 'icon-btn',
                      style: 'width:16px;height:16px',
                      title: `Remove ${s}`,
                      'aria-label': `Remove ${s}`,
                      onclick: () => {
                        f.skills = f.skills.filter((x) => x !== s);
                        render();
                      },
                    },
                    '×'
                  )
                );
              })
            )
          : h('p', { class: 'subtle', style: 'margin:0' }, 'No skills found on the profile.'),
      ], state.aiFilled.has('skills'))
    );

    // Note
    out.push(
      details('Recruiter note', false, [
        h('textarea', {
          class: 'textarea',
          id: 'note',
          placeholder: 'Why this person? Internal only, never shown to clients.',
          value: f.note,
          oninput: (e) => (f.note = e.target.value),
        }),
        f.aiSummary &&
          h(
            'button',
            {
              class: 'btn ghost sm',
              style: 'margin-top:6px',
              onclick: () => {
                f.note = f.aiSummary;
                render();
              },
            },
            icon('sparkles'),
            'Use AI summary'
          ),
      ])
    );

    return out;
  },
};

// ---- view helpers ----------------------------------------------------------

function sk(w, hgt, mt = 0) {
  return h('div', { class: 'skeleton', style: `width:${typeof w === 'number' ? `${w}px` : w};height:${hgt}px;margin-top:${mt}px` });
}

function step(n, text) {
  return h('li', {}, h('span', { class: 'n' }, String(n)), h('span', {}, text));
}

function input(key, label, full = false, placeholder = '') {
  const id = `f-${key}`;
  return h(
    'div',
    { class: `field ${full ? 'full' : ''}` },
    h('label', { for: id }, label, state.aiFilled?.has(key) ? h('span', { class: 'subtle', style: 'font-weight:500' }, ' · AI') : null),
    h('input', {
      class: `input ${state.aiFilled?.has(key) ? 'filled-by-ai' : ''}`,
      id,
      value: state.form[key] ?? '',
      placeholder,
      oninput: (e) => (state.form[key] = e.target.value),
      onchange: () => {
        if (['email', 'phone', 'firstName', 'lastName'].includes(key)) checkDuplicates();
        if (['currentTitle', 'location', 'yearsExperience'].includes(key) && state.jobId) refreshMatch();
      },
    })
  );
}

function details(title, open, children, ai = false) {
  return h(
    'details',
    { class: 'card', open },
    h('summary', {}, h('p', { class: 'section-title' }, title, ai ? h('span', { class: 'pill info' }, icon('sparkles'), 'AI') : null), icon('chevron', 'chev')),
    h('div', { class: 'body' }, ...children)
  );
}

function enrichPill() {
  switch (state.enrich) {
    case 'running':
      return h('span', { class: 'pill info' }, h('span', { class: 'spinner', style: 'width:10px;height:10px' }), 'AI reading profile…');
    case 'done':
      return h('span', { class: 'pill info' }, icon('sparkles'), 'AI enriched');
    case 'failed':
      return h(
        'button',
        {
          class: 'pill warning',
          style: 'border:0;cursor:pointer',
          title: 'Retry AI extraction',
          onclick: () => {
            state.enrich = 'running';
            render();
            enrichWithAi();
          },
        },
        icon('alert'),
        'AI unavailable · retry'
      );
    default:
      return null;
  }
}

function dupePill() {
  if (state.dupes === null) return h('span', { class: 'pill' }, h('span', { class: 'spinner', style: 'width:10px;height:10px' }), 'Checking SWFS…');
  if (!state.dupes.length) return h('span', { class: 'pill success' }, icon('check'), 'New to SWFS');
  return h('span', { class: 'pill warning' }, icon('alert'), 'Possible duplicate');
}

function matchView() {
  const m = state.match;
  if (!state.jobId || !m) return null;
  if (m.loading) return h('div', { class: 'match' }, h('span', { class: 'spinner' }), h('span', { class: 'muted' }, 'Scoring against the JD…'));
  const tone = m.score >= 80 ? 'success' : m.score >= 60 ? 'info' : m.score >= 45 ? 'warning' : '';
  return h(
    'div',
    {},
    h(
      'div',
      { class: 'match' },
      h('span', { class: 'match-score' }, `${m.score}%`),
      h(
        'div',
        { class: 'grow' },
        h('span', { class: `pill ${tone}` }, m.score >= 80 ? 'Strong fit' : m.score >= 60 ? 'Good fit' : m.score >= 45 ? 'Partial fit' : 'Weak fit'),
        h('div', { class: 'meter', style: 'margin-top:6px' }, h('span', { style: `width:${m.score}%` }))
      )
    ),
    (m.matchedSkills.length || m.missingSkills.length) &&
      h(
        'div',
        { class: 'chips', style: 'margin-top:10px' },
        ...m.matchedSkills.map((s) => h('span', { class: 'chip ok' }, `✓ ${s}`)),
        ...m.missingSkills.map((s) => h('span', { class: 'chip miss' }, s))
      ),
    h('p', { class: 'subtle', style: 'margin:8px 0 0' }, 'Same score the portal shows once saved.')
  );
}

function fmtYm(ym) {
  if (!ym) return '';
  const [y, m] = String(ym).split('-');
  if (!m) return y;
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

// ---------------------------------------------------------------------------
// Live updates
// ---------------------------------------------------------------------------

let debounce;
const reload = () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => loadContext(), 400);
};
chrome.tabs.onActivated.addListener(reload);
chrome.tabs.onUpdated.addListener((_id, info, tab) => {
  if (tab.active && (info.url || info.status === 'complete')) reload();
});
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'auth-changed') boot();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.settings) boot();
  if (area === 'local' && changes.auth && !changes.auth.newValue && state.auth) boot();
});

window.swfsDisconnect = async () => {
  await clearAuth();
  boot();
};

boot();
