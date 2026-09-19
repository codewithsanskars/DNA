import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import Button from '../components/shared/Button';
import Badge from '../components/shared/Badge';
import Avatar from '../components/shared/Avatar';
import { Field, Input, Select } from '../components/shared/Field';
import { EmptyState } from '../components/shared/States';
import Icon from '../components/shared/Icon';
import { candidateApi } from '../api/candidate.api';
import { queryKeys } from '../api/queryKeys';
import { useJobs } from '../hooks/useJobs';
import { useCandidates } from '../hooks/useCandidates';
import { useToast } from '../components/shared/Toast';

const LINKEDIN_PEOPLE_SEARCH = 'https://www.linkedin.com/search/results/people/?keywords=';
const RESUME_ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function splitName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

export default function SearchPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const { data: jobs } = useJobs();
  const { data: candidates } = useCandidates();

  // --- LinkedIn search launcher ----------------------------------------
  const [keywords, setKeywords] = useState(params.get('q') || '');

  const runSearch = () => {
    window.open(
      LINKEDIN_PEOPLE_SEARCH + encodeURIComponent(keywords.trim()),
      '_blank',
      'noopener'
    );
  };

  const seedFromRole = (jobId: string) => {
    const job = jobs?.find((j) => j._id === jobId);
    if (job) setKeywords([job.title, job.location].filter(Boolean).join(' '));
  };

  // --- Capture form ---------------------------------------------------
  const prefill = splitName(params.get('name') || '');
  const [form, setForm] = useState({
    linkedinUrl: params.get('url') || '',
    firstName: prefill.first,
    lastName: prefill.last,
    currentTitle: params.get('title') || '',
    currentCompany: params.get('company') || '',
    location: params.get('location') || '',
    email: params.get('email') || '',
    phone: params.get('phone') || '',
    website: params.get('website') || '',
    jobId: '',
  });
  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const [lastAdded, setLastAdded] = useState<{ id: string; name: string } | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeInputKey, setResumeInputKey] = useState(0);
  const hasPrefill = Array.from(params.keys()).some((k) => k !== 'q');

  const handleResumeFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file && !/\.(pdf|docx)$/i.test(file.name)) {
      toast.error('Résumé must be a .pdf or .docx file');
      e.target.value = '';
      setResumeFile(null);
      return;
    }
    setResumeFile(file);
  };

  const addCandidate = useMutation({
    mutationFn: async () => {
      const candidate = await candidateApi.createCandidate({
        source: 'LINKEDIN',
        linkedinUrl: form.linkedinUrl.trim() || undefined,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        currentTitle: form.currentTitle.trim() || undefined,
        currentCompany: form.currentCompany.trim() || undefined,
        location: form.location.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        website: form.website.trim() || undefined,
        jobId: form.jobId || undefined,
      });
      if (resumeFile) {
        try {
          await candidateApi.uploadResume(candidate._id, resumeFile);
        } catch {
          toast.error('Candidate added, but the résumé failed to attach', 'You can attach it from their profile.');
        }
      }
      return candidate;
    },
    onSuccess: (candidate) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.candidates });
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      setLastAdded({ id: candidate._id, name: `${candidate.firstName} ${candidate.lastName}` });
      toast.success(`${candidate.firstName} ${candidate.lastName} added`, 'Now in your candidates list.');
      setForm({
        linkedinUrl: '',
        firstName: '',
        lastName: '',
        currentTitle: '',
        currentCompany: '',
        location: '',
        email: '',
        phone: '',
        website: '',
        jobId: '',
      });
      setResumeFile(null);
      setResumeInputKey((k) => k + 1);
      if (Array.from(params.keys()).length) setParams({}, { replace: true });
    },
    onError: () => toast.error('Couldn’t add the candidate', 'Please try again.'),
  });

  const canSubmit = !!form.firstName.trim() && !!form.lastName.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSubmit) addCandidate.mutate();
  };

  // --- Quick-add button ---------------------------------------------
  const bookmarklet = useMemo(() => {
    const origin = window.location.origin;
    const code = [
      'var d=document;',
      "var n=d.title.replace(/\\s*[|\\-\\u2013]\\s*LinkedIn.*$/i,'').trim();",
      // Email/phone/website only ever appear in the "Contact info" overlay —
      // scope the search to it (falling back to the whole doc) so we don't
      // pick up an unrelated mailto/tel/link elsewhere on the page.
      "var scope=d.querySelector('.pv-contact-info, [class*=\"contact-info\"]')||d.body;",
      "var hasOverlay=scope!==d.body;",
      // Contact info renders as labeled sections (Email / Phone / Websites).
      // Phone numbers in particular are plain text, not a tel: link, so find
      // each section by its heading and read from there instead of guessing
      // off the whole overlay's text (which is where phone scraping broke).
      "function sec(label){var hs=scope.querySelectorAll('h3,h2');for(var i=0;i<hs.length;i++){if((hs[i].textContent||'').trim().toLowerCase().indexOf(label)===0){return hs[i].closest('section')||hs[i].parentElement;}}return null;}",
      "var e='';",
      'var m=scope.querySelector(\'a[href^="mailto:"]\');',
      "if(m){e=decodeURIComponent(m.href.slice(7).split('?')[0]);}",
      "if(!e){var es=sec('email');var et=(es?es.innerText:scope.innerText)||'';var xe=et.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i);if(xe){e=xe[0];}}",
      "var p='';",
      'var t=scope.querySelector(\'a[href^="tel:"]\');',
      "if(t){p=decodeURIComponent(t.href.slice(4).split('?')[0]);}",
      "if(!p){var ps=sec('phone');var pt=(ps?ps.innerText:'')||'';var xp=pt.match(/\\+?[0-9][0-9()\\-.\\s]{6,}[0-9]/);if(xp){p=xp[0].trim();}}",
      "if(!p){var xp2=(scope.innerText||'').match(/\\+?[0-9][0-9()\\-.\\s]{7,}[0-9]/);if(xp2){p=xp2[0].trim();}}",
      "var w='';",
      "var ws=sec('website');",
      "if(ws){var wl=ws.querySelector('a[href]');if(wl){w=wl.href.split('?')[0];}else{var wt=(ws.innerText||'').replace(/websites?/i,'').trim();var xw=wt.match(/https?:\\/\\/\\S+|www\\.\\S+/i);if(xw){w=xw[0];}}}",
      "if(!w){var ls=scope.querySelectorAll('a[href^=\"http\"]');for(var j=0;j<ls.length;j++){var href=ls[j].href;if(!/linkedin\\.com/i.test(href)){w=href.split('?')[0];break;}}}",
      // The URL bar still shows /overlay/contact-info/ while that panel is
      // open — strip it so we store the canonical profile URL, not the panel.
      "var u=location.href.split('?')[0].replace(/\\/overlay\\/contact-info\\/?$/,'');",
      "var q='url='+encodeURIComponent(u)+'&name='+encodeURIComponent(n);",
      "if(e){q+='&email='+encodeURIComponent(e);}",
      "if(p){q+='&phone='+encodeURIComponent(p);}",
      "if(w){q+='&website='+encodeURIComponent(w);}",
      "if(!hasOverlay&&!e&&!p&&!w){alert('Open \"Contact info\" on this profile first, then run Add to SWFS again to capture email/phone/website.');}",
      `window.open('${origin}/search?'+q,'_blank');`,
    ].join('');
    return 'javascript:(function(){' + code + '})();';
  }, []);

  // --- Recently sourced -------------------------------------------
  const sourced = useMemo(
    () => (candidates || []).filter((c) => c.source === 'LINKEDIN').slice().reverse(),
    [candidates]
  );

  return (
    <AppLayout title="Search">
      {/* Search bar */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-xs sm:p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runSearch();
          }}
        >
          <label htmlFor="li-search" className="text-[13px] font-semibold text-foreground">
            Search LinkedIn
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Icon
                name="search"
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle-foreground"
              />
              <Input
                id="li-search"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="Job title, skills, company, location…"
                className="h-10 pl-9"
              />
            </div>
            <Button type="submit" variant="primary" icon="external" className="h-10 shrink-0 px-5">
              Search
            </Button>
          </div>
        </form>

        {(jobs || []).length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">
              Search for one of your roles
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(jobs || []).slice(0, 8).map((j) => (
                <button
                  key={j._id}
                  type="button"
                  onClick={() => seedFromRole(j._id)}
                  className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {j.title}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
          <Icon name="bookmark" size={14} className="text-subtle-foreground" />
          <span>Add profiles in one click —</span>
          <a
            ref={(el) => el && el.setAttribute('href', bookmarklet)}
            onClick={(e) => e.preventDefault()}
            className="inline-flex cursor-grab items-center gap-1 rounded-md border border-border-strong bg-muted px-2 py-0.5 font-medium text-foreground"
          >
            <Icon name="plus" size={12} />
            Add to SWFS
          </a>
          <span>drag this to your bookmarks bar.</span>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Recently sourced */}
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-[13px] font-semibold text-foreground">Recently added from LinkedIn</h2>
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
            {sourced.length === 0 ? (
              <EmptyState
                icon="linkedin"
                title="No sourced candidates yet"
                description="People you add here appear in this list and in the Candidates tab."
                className="py-14"
              />
            ) : (
              <ul className="divide-y divide-border">
                {sourced.map((c) => (
                  <li key={c._id}>
                    <Link
                      to={`/candidates/${c._id}`}
                      className="group flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={c.firstName} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {c.firstName} {c.lastName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {c.currentTitle || '—'}
                            {c.currentCompany && ` · ${c.currentCompany}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {c.jobLinks.length > 0 ? (
                          <Badge tone="neutral">
                            {c.jobLinks.length} role{c.jobLinks.length > 1 ? 's' : ''}
                          </Badge>
                        ) : (
                          <Badge tone="warning">Unlinked</Badge>
                        )}
                        {c.linkedinUrl && (
                          <span
                            className="text-subtle-foreground transition-colors group-hover:text-foreground"
                            aria-hidden="true"
                          >
                            <Icon name="external" size={14} />
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Capture form */}
        <div>
          <h2 className="mb-3 text-[13px] font-semibold text-foreground">Add a candidate</h2>
          <div className="rounded-lg border border-border bg-card shadow-xs">
            <form onSubmit={handleSubmit} className="space-y-4 p-5">
              {hasPrefill && (
                <p className="rounded-md bg-muted px-3 py-2 text-2xs text-muted-foreground">
                  Details brought in from LinkedIn — review and adjust before saving.
                </p>
              )}

              <Field label="LinkedIn profile URL">
                {(id) => (
                  <Input
                    id={id}
                    value={form.linkedinUrl}
                    onChange={set('linkedinUrl')}
                    placeholder="https://www.linkedin.com/in/…"
                  />
                )}
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="First name" required>
                  {(id) => <Input id={id} value={form.firstName} onChange={set('firstName')} required />}
                </Field>
                <Field label="Last name" required>
                  {(id) => <Input id={id} value={form.lastName} onChange={set('lastName')} required />}
                </Field>
              </div>

              <Field label="Current designation">
                {(id) => (
                  <Input
                    id={id}
                    value={form.currentTitle}
                    onChange={set('currentTitle')}
                    placeholder="e.g. Staff Engineer"
                  />
                )}
              </Field>
              <Field label="Current company">
                {(id) => <Input id={id} value={form.currentCompany} onChange={set('currentCompany')} />}
              </Field>
              <Field label="Location">
                {(id) => <Input id={id} value={form.location} onChange={set('location')} />}
              </Field>
              <Field label="Email" hint="optional">
                {(id) => <Input id={id} type="email" value={form.email} onChange={set('email')} />}
              </Field>
              <Field label="Phone" hint="optional">
                {(id) => <Input id={id} type="tel" value={form.phone} onChange={set('phone')} />}
              </Field>
              <Field label="Website" hint="optional">
                {(id) => <Input id={id} type="url" value={form.website} onChange={set('website')} />}
              </Field>
              <Field label="Résumé / CV" hint="optional · .pdf or .docx" help={resumeFile?.name}>
                {(id) => (
                  <Input key={resumeInputKey} id={id} type="file" accept={RESUME_ACCEPT} onChange={handleResumeFile} />
                )}
              </Field>

              <Field
                label="Link to role"
                hint="optional"
                help="A candidate's client is determined by the role(s) they're linked to."
              >
                {(id) => (
                  <Select id={id} value={form.jobId} onChange={set('jobId')}>
                    <option value="">No role yet</option>
                    {(jobs || []).map((j) => (
                      <option key={j._id} value={j._id}>
                        {j.title}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              {addCandidate.isError && (
                <p className="text-xs text-brand-text">Couldn’t add the candidate. Please try again.</p>
              )}

              {lastAdded && !addCandidate.isPending && (
                <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-[13px]">
                  <span className="inline-flex items-center gap-1.5 text-foreground">
                    <Icon name="check" size={14} className="text-emerald-500" />
                    Added {lastAdded.name}
                  </span>
                  <Link
                    to={`/candidates/${lastAdded.id}`}
                    className="font-medium text-brand-text hover:underline"
                  >
                    View
                  </Link>
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={!canSubmit}
                loading={addCandidate.isPending}
              >
                {addCandidate.isPending ? 'Adding…' : 'Add to candidates'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
