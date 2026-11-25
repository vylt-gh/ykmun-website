/* Builds the site menu, top-right language toggle, and navigation drawer.
 *
 * The pages share no component system, so injecting the markup here is what
 * keeps the menu and language controls identical everywhere without copying
 * them into each file. */

(() => {
    'use strict';

    // Committees are deliberately absent until there is content for them; an
    // empty section in the menu is worse than no section.
    //
    // The group registration has its own entry because it is the one form
    // people arrive looking for: it opens the application hub with the group
    // form already chosen.
    const I18N = {
        en: {
            nav: [
                { href: 'home', label: 'Home' },
                { href: 'apply', label: 'Apply' },
                { href: 'apply?as=group', label: 'Delegation' },
                { href: 'home#team', label: 'Team' },
                { href: 'kvkk', label: 'Privacy' }
            ],
            langAria: 'Switch language to Turkish',
            menuAria: 'Menu'
        },
        tr: {
            nav: [
                { href: 'home', label: 'Ana Sayfa' },
                { href: 'apply', label: 'Başvuru' },
                { href: 'apply?as=group', label: 'Delegasyon' },
                { href: 'home#team', label: 'Ekip' },
                { href: 'kvkk', label: 'Gizlilik' }
            ],
            langAria: 'Dili İngilizceye çevir',
            menuAria: 'Menü'
        }
    };

    function getInitialLanguage() {
        try {
            const stored = localStorage.getItem('ykmun_lang');
            if (stored === 'en' || stored === 'tr') return stored;
        } catch (_) {}
        const htmlLang = (document.documentElement.lang || '').toLowerCase();
        if (htmlLang.startsWith('tr')) return 'tr';
        if (htmlLang.startsWith('en')) return 'en';
        const navLang = (navigator.language || '').toLowerCase();
        if (navLang.startsWith('tr')) return 'tr';
        return 'en';
    }

    let currentLang = getInitialLanguage();

    const actions = document.createElement('div');
    actions.className = 'nav-actions';

    const langToggle = document.createElement('button');
    langToggle.type = 'button';
    langToggle.className = 'lang-toggle';
    langToggle.setAttribute('aria-label', I18N[currentLang].langAria);

    const enOpt = document.createElement('span');
    enOpt.className = 'lang-opt' + (currentLang === 'en' ? ' is-active' : '');
    enOpt.dataset.lang = 'en';
    enOpt.textContent = 'EN';

    const sep = document.createElement('span');
    sep.className = 'lang-sep';
    sep.setAttribute('aria-hidden', 'true');
    sep.textContent = '/';

    const trOpt = document.createElement('span');
    trOpt.className = 'lang-opt' + (currentLang === 'tr' ? ' is-active' : '');
    trOpt.dataset.lang = 'tr';
    trOpt.textContent = 'TR';

    langToggle.append(enOpt, sep, trOpt);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'nav-toggle';
    toggle.setAttribute('aria-label', I18N[currentLang].menuAria);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'nav-drawer');

    for (let i = 0; i < 3; i++) {
        toggle.appendChild(document.createElement('span'));
    }

    actions.append(langToggle, toggle);

    const drawer = document.createElement('div');
    drawer.className = 'nav-drawer';
    drawer.id = 'nav-drawer';
    drawer.hidden = true;

    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Main');

    const navAnchors = [];
    for (let i = 0; i < I18N.en.nav.length; i++) {
        const item = I18N[currentLang].nav[i];
        const anchor = document.createElement('a');
        anchor.href = item.href;
        anchor.textContent = item.label;
        nav.appendChild(anchor);
        navAnchors.push(anchor);
    }

    const drawerLang = document.createElement('div');
    drawerLang.className = 'nav-drawer-lang';
    drawerLang.setAttribute('aria-label', 'Language');

    const drawerEn = document.createElement('button');
    drawerEn.type = 'button';
    drawerEn.className = 'drawer-lang-btn' + (currentLang === 'en' ? ' is-active' : '');
    drawerEn.dataset.lang = 'en';
    drawerEn.textContent = 'English';

    const drawerSep = document.createElement('span');
    drawerSep.className = 'drawer-lang-sep';
    drawerSep.setAttribute('aria-hidden', 'true');
    drawerSep.textContent = '·';

    const drawerTr = document.createElement('button');
    drawerTr.type = 'button';
    drawerTr.className = 'drawer-lang-btn' + (currentLang === 'tr' ? ' is-active' : '');
    drawerTr.dataset.lang = 'tr';
    drawerTr.textContent = 'Türkçe';

    drawerLang.append(drawerEn, drawerSep, drawerTr);
    drawer.append(nav, drawerLang);

    document.body.append(actions, drawer);

    function setOpen(open) {
        drawer.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        document.body.classList.toggle('nav-open', open);
    }

    toggle.addEventListener('click', () => setOpen(drawer.hidden));

    // A click on any link inside the drawer closes the drawer.
    nav.addEventListener('click', (event) => {
        if (event.target.closest('a')) setOpen(false);
    });

    // A click on the backdrop, rather than on a link, closes the drawer.
    drawer.addEventListener('click', (event) => {
        if (event.target === drawer) setOpen(false);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !drawer.hidden) setOpen(false);
    });

    function applyTranslations(lang, { userInitiated = false } = {}) {
        const isTr = lang === 'tr';

        // Update elements with explicit data-tr and data-en attributes
        document.querySelectorAll('[data-tr][data-en]').forEach((el) => {
            const val = el.getAttribute('data-' + lang);
            if (val) {
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    if (el.placeholder) el.placeholder = val;
                } else {
                    const req = el.querySelector('.req');
                    if (req) {
                        el.textContent = val + ' ';
                        el.appendChild(req);
                    } else {
                        el.textContent = val;
                    }
                }
            }
        });

        // 1. Home page
        const homeCta = document.querySelector('.stage-foot .cta');
        if (homeCta) {
            homeCta.textContent = isTr ? 'Başvur' : 'Apply';
        }
        const stageDate = document.querySelector('.meta-card .meta-card-text, .stage-meta span:first-child');
        if (stageDate) {
            stageDate.textContent = isTr ? '15–17 Ocak 2027' : '15–17 January 2027';
        }
        const counterImg = document.querySelector('.counter-plate');
        if (counterImg) {
            counterImg.alt = isTr ? "YKMUN'a kalan gün sayacı" : 'Countdown to YKMUN';
        }

        // 2. Team section
        const teamH1 = document.querySelector('#team .head h1');
        if (teamH1) {
            teamH1.textContent = isTr ? 'Ekibimiz' : 'Our Team';
        }
        const teamNote = document.querySelector('#team .head .note');
        if (teamNote) {
            teamNote.textContent = isTr ? "YKMUN'un arkasındaki ekip." : 'The people behind YKMUN.';
        }
        if (typeof updateTeamToggleState === 'function') {
            updateTeamToggleState(lang);
        }

        // 3. Document titles
        if (typeof document !== 'undefined' && document.title) {
            if (/home/i.test(document.title) || document.title === 'YKMUN - Ana Sayfa') {
                document.title = isTr ? 'YKMUN - Ana Sayfa' : 'YKMUN - Home';
            } else if (/team/i.test(document.title) || document.title === 'YKMUN - Ekip') {
                document.title = isTr ? 'YKMUN - Ekip' : 'YKMUN - Team';
            } else if (/appl/i.test(document.title) || document.title === 'YKMUN - Başvuru') {
                document.title = isTr ? 'YKMUN - Başvuru' : 'YKMUN - Apply';
            }
        }

        // 4. KVKK page smooth scroll when toggled
        const loc = typeof window !== 'undefined' && window.location ? window.location.pathname : '';
        if (userInitiated && (loc.includes('kvkk') || document.querySelector('.form.legal'))) {
            if (typeof window !== 'undefined' && window.scrollTo) {
                if (isTr) {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                    const enSection = document.querySelector('.lang-title') || document.querySelector('[lang="en"]');
                    if (enSection && enSection.scrollIntoView) enSection.scrollIntoView({ behavior: 'smooth' });
                }
            }
        }
    }

    function setLanguage(lang, options = {}) {
        if (lang !== 'en' && lang !== 'tr') return;
        currentLang = lang;
        document.documentElement.lang = lang;
        try {
            localStorage.setItem('ykmun_lang', lang);
        } catch (_) {}

        enOpt.classList.toggle('is-active', lang === 'en');
        trOpt.classList.toggle('is-active', lang === 'tr');
        langToggle.setAttribute('aria-label', I18N[lang].langAria);
        toggle.setAttribute('aria-label', I18N[lang].menuAria);

        drawerEn.classList.toggle('is-active', lang === 'en');
        drawerTr.classList.toggle('is-active', lang === 'tr');

        for (let i = 0; i < navAnchors.length; i++) {
            navAnchors[i].textContent = I18N[lang].nav[i].label;
        }

        applyTranslations(lang, options);

        window.dispatchEvent(new CustomEvent('ykmun:lang', { detail: { lang } }));
    }

    langToggle.addEventListener('click', (event) => {
        const opt = event.target.closest('.lang-opt');
        if (opt && opt.dataset.lang) {
            setLanguage(opt.dataset.lang, { userInitiated: true });
        } else {
            setLanguage(currentLang === 'en' ? 'tr' : 'en', { userInitiated: true });
        }
    });

    drawerLang.addEventListener('click', (event) => {
        const btn = event.target.closest('.drawer-lang-btn');
        if (btn && btn.dataset.lang) {
            setLanguage(btn.dataset.lang, { userInitiated: true });
        }
    });

    function setupTeamCollapsible() {
        const depts = Array.from(document.querySelectorAll('details.dept'));
        const toggleAllBtns = Array.from(document.querySelectorAll('.team-toggle-all'));
        if (!depts.length) return null;

        const prefersReduced = typeof window !== 'undefined' &&
            window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        function isExpanded(dept) {
            return dept.open && !dept.classList.contains('is-closing');
        }

        function updateToggleAll(lang = currentLang) {
            const isTr = lang === 'tr';
            const allOpen = depts.every(isExpanded);
            toggleAllBtns.forEach((btn) => {
                btn.setAttribute('aria-expanded', allOpen ? 'true' : 'false');
                btn.dataset.en = allOpen ? 'Collapse all' : 'Expand all';
                btn.dataset.tr = allOpen ? 'Tümünü kapat' : 'Tümünü aç';
                btn.textContent = isTr ? btn.dataset.tr : btn.dataset.en;
            });
        }

        function setDeptOpen(dept, shouldOpen) {
            const summary = dept.querySelector('.dept-summary');
            if (!summary || prefersReduced || typeof dept.animate !== 'function') {
                dept.classList.remove('is-closing');
                dept.open = shouldOpen;
                updateToggleAll();
                return;
            }

            if (dept._anim) {
                dept._anim.cancel();
                dept._anim = null;
            }

            const startHeight = dept.offsetHeight;

            if (shouldOpen) {
                dept.classList.remove('is-closing');
                dept.style.overflow = 'hidden';
                dept.open = true;
                const endHeight = dept.offsetHeight;
                updateToggleAll();

                dept._anim = dept.animate(
                    { height: [startHeight + 'px', endHeight + 'px'] },
                    { duration: 280, easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)' }
                );
                dept._anim.onfinish = () => {
                    dept._anim = null;
                    dept.style.height = '';
                    dept.style.overflow = '';
                };
                dept._anim.oncancel = () => {
                    dept._anim = null;
                    dept.style.height = '';
                    dept.style.overflow = '';
                };
            } else {
                if (!dept.open) return;
                dept.classList.add('is-closing');
                dept.style.overflow = 'hidden';
                const endHeight = summary.offsetHeight;
                updateToggleAll();

                dept._anim = dept.animate(
                    { height: [startHeight + 'px', endHeight + 'px'] },
                    { duration: 240, easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)' }
                );
                dept._anim.onfinish = () => {
                    dept._anim = null;
                    dept.open = false;
                    dept.classList.remove('is-closing');
                    dept.style.height = '';
                    dept.style.overflow = '';
                    updateToggleAll();
                };
                dept._anim.oncancel = () => {
                    dept._anim = null;
                    dept.classList.remove('is-closing');
                    dept.style.height = '';
                    dept.style.overflow = '';
                };
            }
        }

        depts.forEach((dept) => {
            const summary = dept.querySelector('.dept-summary');
            if (summary) {
                summary.addEventListener('click', (event) => {
                    event.preventDefault();
                    setDeptOpen(dept, !isExpanded(dept));
                });
            }
            dept.addEventListener('toggle', () => {
                updateToggleAll();
            });
        });

        toggleAllBtns.forEach((btn) => {
            btn.addEventListener('click', () => {
                const nextState = !depts.every(isExpanded);
                depts.forEach((dept) => {
                    if (isExpanded(dept) !== nextState) {
                        setDeptOpen(dept, nextState);
                    }
                });
            });
        });

        function openFromHash() {
            if (typeof window === 'undefined' || !window.location.hash) return;
            try {
                const target = document.querySelector(window.location.hash);
                if (target && target.matches('details.dept')) {
                    target.open = true;
                    target.classList.remove('is-closing');
                    updateToggleAll();
                    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            } catch (_) {}
        }

        openFromHash();
        if (typeof window !== 'undefined') {
            window.addEventListener('hashchange', openFromHash);
        }

        return updateToggleAll;
    }

    const updateTeamToggleState = setupTeamCollapsible();

    window.YKMUN_LANG = {
        get: () => currentLang,
        set: (lang) => setLanguage(lang, { userInitiated: true })
    };

    setLanguage(currentLang);
})();
