import axios from 'axios';
import * as cheerio from 'cheerio';
import { assertPublicHost } from '../utils/ssrfGuard';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 3 * 1024 * 1024; // 3MB — an "about" page has no business being bigger than this
const MAX_ANCHORS_SCANNED = 500;

export interface ScrapedOrganization {
  name?: string;
  description?: string;
  website?: string;
  logoUrl?: string;
  email?: string;
  hq?: string;
  employeeCount?: number;
  founded?: string;
  socialLinks?: { linkedin?: string; twitter?: string; facebook?: string; instagram?: string };
  sourceUrl: string;
}

function absolutize(maybeUrl: string | undefined | null, base: string): string | undefined {
  if (!maybeUrl) return undefined;
  try {
    return new URL(maybeUrl, base).toString();
  } catch {
    return undefined;
  }
}

function cleanText(value: unknown, max = 600): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

type SocialKey = 'linkedin' | 'twitter' | 'facebook' | 'instagram';
const SOCIAL_HOST_MAP: { test: RegExp; key: SocialKey }[] = [
  { test: /(^|\.)linkedin\.com$/i, key: 'linkedin' },
  { test: /(^|\.)(twitter\.com|x\.com)$/i, key: 'twitter' },
  { test: /(^|\.)facebook\.com$/i, key: 'facebook' },
  { test: /(^|\.)instagram\.com$/i, key: 'instagram' },
];

/** Finds the first JSON-LD node whose @type looks like a company/organization. */
function findOrganizationLd($: cheerio.CheerioAPI): Record<string, any> {
  let found: Record<string, any> = {};
  $('script[type="application/ld+json"]').each((_, el) => {
    if (Object.keys(found).length) return;
    let parsed: any;
    try {
      parsed = JSON.parse($(el).text());
    } catch {
      return;
    }
    const nodes = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.['@graph']) ? parsed['@graph'] : [parsed];
    for (const node of nodes) {
      const type = node?.['@type'];
      const types = Array.isArray(type) ? type : [type];
      if (types.some((t) => typeof t === 'string' && /organization|corporation|localbusiness/i.test(t))) {
        found = node;
        break;
      }
    }
  });
  return found;
}

export const scrapeService = {
  /**
   * Fetches a company's public "About" (or any) page and pulls out whatever
   * an Organization form can use — from schema.org JSON-LD when the site
   * publishes it, falling back to OpenGraph/meta tags and plain scanning.
   * Returns a preview only; nothing is written to the database here.
   */
  scrapeCompanyPage: async (rawUrl: string): Promise<ScrapedOrganization> => {
    let target: URL;
    try {
      target = new URL(rawUrl);
    } catch {
      throw new Error('Enter a valid URL, including https://');
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      throw new Error('Only http(s) URLs can be scraped.');
    }

    await assertPublicHost(target.hostname);

    let html: string;
    try {
      const res = await axios.get<string>(target.toString(), {
        timeout: FETCH_TIMEOUT_MS,
        maxContentLength: MAX_BYTES,
        maxRedirects: 5,
        responseType: 'text',
        transformResponse: (data) => data,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SWFSPortalBot/1.0; +https://swfs.ai)',
          Accept: 'text/html,application/xhtml+xml',
        },
        validateStatus: (status) => status >= 200 && status < 400,
      });
      html = res.data;
    } catch {
      throw new Error('Couldn’t reach that page. Check the URL and try again.');
    }

    const $ = cheerio.load(html);
    const base = target.toString();
    const meta = (name: string) =>
      $(`meta[property="${name}"]`).attr('content') || $(`meta[name="${name}"]`).attr('content');

    const ld = findOrganizationLd($);

    const name = cleanText(ld.name) || cleanText(meta('og:site_name')) || cleanText($('title').first().text(), 120);
    const description = cleanText(ld.description) || cleanText(meta('og:description')) || cleanText(meta('description'));

    const logoUrl =
      absolutize(typeof ld.logo === 'string' ? ld.logo : ld.logo?.url, base) ||
      absolutize(meta('og:image'), base) ||
      absolutize($('link[rel="apple-touch-icon"]').attr('href'), base) ||
      absolutize($('link[rel="icon"]').attr('href'), base);

    const email =
      cleanText(ld.email) ||
      cleanText($('a[href^="mailto:"]').first().attr('href')?.replace(/^mailto:/i, '').split('?')[0]);

    let hq: string | undefined;
    if (typeof ld.address === 'string') {
      hq = cleanText(ld.address, 120);
    } else if (ld.address && typeof ld.address === 'object') {
      hq = cleanText(
        [ld.address.addressLocality, ld.address.addressRegion, ld.address.addressCountry].filter(Boolean).join(', '),
        120
      );
    }

    const employeeCount = (() => {
      const raw = ld.numberOfEmployees;
      const val = typeof raw === 'object' && raw !== null ? raw.value : raw;
      const n = typeof val === 'string' ? parseInt(val, 10) : val;
      return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
    })();

    const founded = cleanText(ld.foundingDate)?.match(/\d{4}/)?.[0];

    const socialLinks: NonNullable<ScrapedOrganization['socialLinks']> = {};
    const sameAs: string[] = Array.isArray(ld.sameAs) ? ld.sameAs : ld.sameAs ? [ld.sameAs] : [];
    const pageLinks = $('a[href]')
      .slice(0, MAX_ANCHORS_SCANNED)
      .map((_, el) => $(el).attr('href') || '')
      .get();
    for (const href of [...sameAs, ...pageLinks]) {
      const abs = absolutize(href, base);
      if (!abs) continue;
      let host: string;
      try {
        host = new URL(abs).hostname;
      } catch {
        continue;
      }
      const match = SOCIAL_HOST_MAP.find((m) => m.test.test(host));
      if (match && !socialLinks[match.key]) socialLinks[match.key] = abs;
    }

    return {
      name,
      description,
      website: `${target.protocol}//${target.host}`,
      logoUrl,
      email,
      hq,
      employeeCount,
      founded,
      socialLinks: Object.keys(socialLinks).length ? socialLinks : undefined,
      sourceUrl: base,
    };
  },
};
