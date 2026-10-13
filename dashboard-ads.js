/* ================================================================
   DASHBOARD ADS — shared, dependency-free module
   ----------------------------------------------------------------
   Drop-in banner for any dashboard view. Put an empty
       <div data-dashboard-ad></div>
   wherever the banner should appear, include this script, and (optionally)
   set window.DASHBOARD_ADS_CONFIG *before* this script loads.

   WHAT YOU MUST DO BEFORE ANY REVENUE FLOWS (I cannot do these for you):
     1. Host the app on a real public domain you own (AdSense will not
        approve localhost / file:// / a private tool behind a login).
     2. Create a Google AdSense account and add + verify your site.
     3. Wait for approval (days to weeks; not guaranteed — AdSense wants
        substantial original publisher content, and dashboard/file-manager
        screens often don't count as "valuable inventory". A public landing
        page or help/blog section dramatically improves approval odds).
     4. In AdSense create a *Display ad unit* -> copy its two values:
          data-ad-client  (looks like ca-pub-1234567890123456)
          data-ad-slot    (a 10-digit number)
     5. Put them in DASHBOARD_ADS_CONFIG (index.html) — until both are real,
        NO request is ever sent to Google; a harmless placeholder shows.
     6. Publish /ads.txt at your domain root (see ads.txt.template).
     7. Publish a privacy policy. If you have visitors from the EEA / UK /
        Switzerland you also need a Google-certified consent banner (CMP);
        set requireConsent:true and call DashboardAds.grantConsent() from
        your CMP once the user agrees.

   POLICY-SAFE BY DESIGN: always labeled "Advertisement", visually separated
   from buttons/cards (no accidental-click placement), never styled to look
   like app UI, lazy-loaded only when actually on screen, and it collapses
   completely if the ad is unfilled, blocked, or offline. Do NOT click your
   own ads or ask users to — that gets AdSense accounts permanently banned.

   DIRECT SPONSOR / AFFILIATE FALLBACK: if AdSense isn't configured yet,
   you can show one sponsor card instead (a paid sponsor, or an affiliate
   link — your commission comes from that program). Links are rendered with
   rel="sponsored noopener" and a visible "Sponsored" label, as required by
   Google and by advertising-disclosure rules (FTC etc.).
================================================================ */
(function () {
    'use strict';

    const DEFAULTS = {
        enabled: true,
        adsenseClient: 'ca-pub-0000000000000000', // REPLACE with your real publisher id
        adSlot: '0000000000',                     // REPLACE with your real ad-unit slot id
        label: 'Advertisement',
        selector: '[data-dashboard-ad]',
        requireConsent: false,
        showPlaceholderWhenUnconfigured: true,
        // Optional direct sponsor / affiliate card shown when AdSense isn't
        // configured. Example:
        // { title: 'Wacom Intuos', text: 'Pen tablets for CAD work', url: 'https://example.com/?ref=you', cta: 'Learn more' }
        fallbackSponsor: null
    };
    const config = Object.assign({}, DEFAULTS, window.DASHBOARD_ADS_CONFIG || {});

    const CLIENT_RE = /^ca-pub-\d{16}$/;
    const SLOT_RE = /^\d{6,20}$/;

    function isConfigured() {
        return CLIENT_RE.test(config.adsenseClient) &&
               SLOT_RE.test(config.adSlot) &&
               !/^ca-pub-0{16}$/.test(config.adsenseClient) &&
               !/^0+$/.test(config.adSlot);
    }

    // ---- consent gate (hook for a real CMP) -----------------------------
    let resolveConsent;
    const consentPromise = new Promise((r) => { resolveConsent = r; });
    function consentGate() { return config.requireConsent ? consentPromise : Promise.resolve(); }

    // ---- AdSense script (loaded once, only when actually needed) ---------
    let scriptPromise = null;
    function loadAdsenseScript() {
        if (scriptPromise) return scriptPromise;
        scriptPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.async = true;
            s.crossOrigin = 'anonymous';
            s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' +
                    encodeURIComponent(config.adsenseClient);
            s.onload = resolve;
            s.onerror = () => reject(new Error('AdSense script unavailable (offline or blocked)'));
            document.head.appendChild(s);
        });
        return scriptPromise;
    }

    // ---- styles (self-injected so it works in any host app) --------------
    let stylesInjected = false;
    function injectStyles() {
        if (stylesInjected) return;
        stylesInjected = true;
        const st = document.createElement('style');
        st.textContent = [
            '.dash-ad{margin:20px 0 28px;padding:10px 12px 12px;border:1px solid rgba(148,163,184,.25);',
            'background:rgba(148,163,184,.05);border-radius:4px;max-width:100%;overflow:hidden;clear:both}',
            '.dash-ad[hidden]{display:none!important}',
            '.dash-ad-label{font:600 10px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.12em;',
            'text-transform:uppercase;color:#94a3b8;margin-bottom:8px;text-align:center}',
            '.dash-ad ins.adsbygoogle{display:block;min-height:90px}',
            '.dash-ad-placeholder,.dash-ad-sponsor{min-height:90px;display:flex;flex-direction:column;',
            'align-items:center;justify-content:center;gap:6px;text-align:center;padding:10px;',
            'font:13px system-ui,-apple-system,Segoe UI,sans-serif;color:#94a3b8}',
            '.dash-ad-placeholder{border:1px dashed rgba(148,163,184,.4)}',
            '.dash-ad-sponsor strong{color:#e2e8f0;font-size:14px}',
            '.dash-ad-sponsor a{color:#818cf8;text-decoration:none;font-weight:600}',
            '.dash-ad-sponsor a:hover{text-decoration:underline}'
        ].join('');
        document.head.appendChild(st);
    }

    function collapse(wrap, reason) {
        wrap.hidden = true;
        if (reason && window.console) console.info('[DashboardAds] collapsed:', reason.message || reason);
    }

    // Request the ad only once the banner is actually on screen. An ad
    // requested inside a display:none container (e.g. the dashboard while
    // the workspace is open) fails with "availableWidth=0".
    function whenVisible(el, cb) {
        if (!('IntersectionObserver' in window)) { cb(); return; }
        const io = new IntersectionObserver((entries) => {
            const hit = entries.some((e) => e.isIntersecting && e.boundingClientRect.width > 0);
            if (hit) { io.disconnect(); cb(); }
        });
        io.observe(el);
    }

    function requestAd(wrap, ins) {
        // Collapse the whole box if Google reports no ad to show.
        new MutationObserver(() => {
            if (ins.getAttribute('data-ad-status') === 'unfilled') collapse(wrap, 'unfilled');
        }).observe(ins, { attributes: true, attributeFilter: ['data-ad-status'] });

        consentGate()
            .then(loadAdsenseScript)
            .then(() => { (window.adsbygoogle = window.adsbygoogle || []).push({}); })
            .catch((e) => collapse(wrap, e));
    }

    function safeHttpUrl(u) {
        try {
            const url = new URL(u, window.location.href);
            return (url.protocol === 'https:' || url.protocol === 'http:') ? url.href : null;
        } catch (e) { return null; }
    }

    function renderSponsor(wrap, sponsor) {
        const href = safeHttpUrl(sponsor.url);
        if (!href) return false;
        wrap.firstChild.textContent = 'Sponsored';
        const card = document.createElement('div');
        card.className = 'dash-ad-sponsor';
        const title = document.createElement('strong');
        title.textContent = sponsor.title || 'Sponsor';
        const text = document.createElement('span');
        text.textContent = sponsor.text || '';
        const link = document.createElement('a');
        link.href = href;
        link.target = '_blank';
        link.rel = 'sponsored noopener noreferrer';
        link.textContent = (sponsor.cta || 'Learn more') + ' →';
        card.append(title, text, link);
        wrap.appendChild(card);
        return true;
    }

    function mount(container) {
        if (!container || container.dataset.adMounted === '1') return; // idempotent
        container.dataset.adMounted = '1';
        if (!config.enabled) return;

        const configured = isConfigured();
        const hasSponsor = !!(config.fallbackSponsor && safeHttpUrl(config.fallbackSponsor.url));
        if (!configured && !hasSponsor && !config.showPlaceholderWhenUnconfigured) return;

        injectStyles();
        const wrap = document.createElement('aside');
        wrap.className = 'dash-ad';
        wrap.setAttribute('aria-label', config.label);
        const label = document.createElement('div');
        label.className = 'dash-ad-label';
        label.textContent = config.label;
        wrap.appendChild(label);
        container.appendChild(wrap);

        if (configured) {
            const ins = document.createElement('ins');
            ins.className = 'adsbygoogle';
            ins.style.display = 'block';
            ins.setAttribute('data-ad-client', config.adsenseClient);
            ins.setAttribute('data-ad-slot', config.adSlot);
            ins.setAttribute('data-ad-format', 'auto');
            ins.setAttribute('data-full-width-responsive', 'true');
            wrap.appendChild(ins);
            whenVisible(wrap, () => requestAd(wrap, ins));
        } else if (hasSponsor) {
            renderSponsor(wrap, config.fallbackSponsor);
        } else {
            label.textContent = 'Ad placement (preview)';
            const ph = document.createElement('div');
            ph.className = 'dash-ad-placeholder';
            ph.textContent = 'Ad space — add your AdSense IDs in DASHBOARD_ADS_CONFIG to enable. No request is sent to Google until then.';
            wrap.appendChild(ph);
        }
    }

    // The dashboard markup may be created slightly after this script runs,
    // so poll briefly for slots instead of assuming they already exist.
    function autoMount(attempt) {
        const nodes = document.querySelectorAll(config.selector);
        nodes.forEach(mount);
        if (!nodes.length && attempt < 30) setTimeout(() => autoMount(attempt + 1), 100);
    }

    window.DashboardAds = {
        mount: mount,
        isConfigured: isConfigured,
        grantConsent: () => resolveConsent(),
        config: config
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => autoMount(0));
    } else {
        autoMount(0);
    }
})();
