(() => {
    'use strict';

    // ---- the four ways in ------------------------------------------------
    //
    // The first screen asks what the applicant is. The answer decides which
    // form is shown, what it is called, and — for the three individual
    // applications — the application_type written to the row (migration 0009).
    //
    // The group registration is the odd one out: it is a group registering,
    // not a person applying, so it goes to a different table, collects none
    // of the personal data an application does, and has no consent box.

    const ROLES = {
        delegate: {
            key: 'delegate',
            title: { en: 'Delegate application', tr: 'Delege başvurusu' },
            note: {
                en: 'Choose up to three committees. The order is your priority.',
                tr: 'En fazla üç komite seçin. Sıralama önceliğinizdir.'
            },
            button: { en: 'Apply', tr: 'Başvur' },
            type: 'delegate',
            committees: true,
            camera: false
        },
        admin: {
            key: 'admin',
            title: { en: 'Admin team application', tr: 'Admin ekibi başvurusu' },
            note: {
                en: 'The admin team runs the conference behind the scenes.',
                tr: 'Admin ekibi konferansın perde arkasını yönetir.'
            },
            button: { en: 'Apply', tr: 'Başvur' },
            type: 'admin',
            committees: false,
            camera: false
        },
        press: {
            key: 'press',
            title: { en: 'Press team application', tr: 'Basın ekibi başvurusu' },
            note: {
                en: 'The press team covers the conference.',
                tr: 'Basın ekibi konferansı belgeler ve kayıt altına alır.'
            },
            button: { en: 'Apply', tr: 'Başvur' },
            type: 'press',
            committees: false,
            camera: true
        },
        group: {
            key: 'group',
            title: { en: 'Delegation registration', tr: 'Delegasyon kaydı' },
            note: {
                en: 'For a school or organisation bringing a group. Each delegate still applies individually.',
                tr: 'Grup getiren okul veya organizasyon için. Her delege ayrıca bireysel başvurur.'
            },
            button: { en: 'Submit', tr: 'Gönder' },
            type: null,
            committees: false,
            camera: false
        }
    };

    function isTr() {
        return (document.documentElement.lang || '').startsWith('tr');
    }

    function t(val) {
        if (!val) return '';
        if (typeof val === 'string') return val;
        return isTr() ? (val.tr || val.en || '') : (val.en || val.tr || '');
    }

    const chooseEl = document.getElementById('choose');
    const panelEl = document.getElementById('panel');
    const headEl = document.getElementById('head');
    const headHint = document.getElementById('head-hint');
    const formTitle = document.getElementById('form-title');
    const formNote = document.getElementById('form-note');
    const backBtn = document.getElementById('back');

    const personForm = document.getElementById('apply-form');
    const groupForm = document.getElementById('group-form');
    const personStatus = document.getElementById('status-person');
    const groupStatus = document.getElementById('status-group');
    const personButton = document.getElementById('submit-btn');
    const groupButton = document.getElementById('submit-group-btn');
    const prefsEl = document.getElementById('prefs');
    const cameraEl = document.getElementById('row-camera');
    const motivationHint = document.getElementById('hint-motivation');

    const doneEl = document.getElementById('done');
    const doneTitle = document.getElementById('done-title');
    const doneEmail = document.getElementById('done-email');

    // Which role is on screen. Null means the first screen is showing.
    let role = null;

    // ---- fields ----------------------------------------------------------

    // Column name -> input id. Keep stable; these are the columns.
    const PERSON_FIELDS = {
        email: 'f-email',
        full_name: 'f-name',
        phone: 'f-phone',
        tc_number: 'f-tc',
        motivation: 'f-motivation'
    };

    const COMMITTEE_FIELDS = {
        committee_1: 'f-committee-1',
        committee_2: 'f-committee-2',
        committee_3: 'f-committee-3'
    };

    const GROUP_FIELDS = {
        group_type: 'f-group-type',
        organisation: 'f-organisation',
        contact_name: 'f-contact',
        email: 'f-group-email',
        headcount: 'f-headcount'
    };

    const MAX_HEADCOUNT = 500;

    // Bump when kvkk.html changes what is being consented to.
    const CONSENT_VERSION = '2026-11-17';

    const CONSENT_INPUT = 'f-consent';

    // Single source of truth for the committee list. The three selects are
    // empty in the HTML and filled from here, so finalising the list is one
    // edit instead of fifteen <option> tags kept in sync across three
    // elements. The list is not settled yet — replace this array and nothing
    // else needs to change.
    const COMMITTEES = [
        'Security Council',
        'Human Rights',
        'Environment',
        'Economic and Financial',
        'Prime Minister\'s Council'
    ];

    for (const id of ['f-committee-1', 'f-committee-2', 'f-committee-3']) {
        const select = document.getElementById(id);
        if (!select) continue;
        for (const name of COMMITTEES) {
            const option = document.createElement('option');
            option.textContent = name;
            select.appendChild(option);
        }
    }

    // Pass the checksum but never actually issued.
    const TC_NEVER_ISSUED = new Set([
        '11111111110', '22222222220', '33333333330', '44444444440',
        '55555555550', '66666666660', '77777777770', '88888888880',
        '99999999990'
    ]);

    // TC Kimlik No checksum: 10th digit is (odd-position sum x 7) - (even-position
    // sum) mod 10; 11th is the sum of the first ten, mod 10. The first expression
    // can go negative, hence the +10.
    function isValidTC(value) {
        if (!/^[1-9][0-9]{10}$/.test(value)) return false;
        if (TC_NEVER_ISSUED.has(value)) return false;
        const d = value.split('').map(Number);
        const odd = d[0] + d[2] + d[4] + d[6] + d[8];
        const even = d[1] + d[3] + d[5] + d[7];
        const tenth = ((odd * 7 - even) % 10 + 10) % 10;
        const eleventh = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
        return d[9] === tenth && d[10] === eleventh;
    }

    let client;

    try {
        const { url, publishableKey } = window.YKMUN_CONFIG;
        // A storage adapter that never yields anything, which pins this client to the
        // `anon` role no matter what is in the browser.
        //
        // Supabase keeps its session in localStorage under the origin, and the
        // admin panel lives on this same origin — so signing in at /admin used
        // to make this public form send its insert as `authenticated`. That role
        // has no INSERT grant on applications by design (migration 0002 grants
        // insert to anon only), so every submission failed with 42501 once
        // anyone had logged into the admin panel on that browser.
        //
        // persistSession:false alone is NOT enough here: measured against a
        // seeded session it still picked one up, because that flag governs
        // writing, not reading. Passing a storage adapter that always returns
        // null is what actually keeps the form anonymous.
        const ANON_STORAGE = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

        client = window.supabase.createClient(url, publishableKey, {
            auth: {
                storage: ANON_STORAGE,
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            }
        });
    } catch (err) {
        // Almost always the CDN script failing to load, which a real visitor on
        // a flaky connection can hit. Say so rather than failing on submit.
        fail('Could not connect. Please refresh the page and try again.');
        disable();
        console.error('supabase client init failed', err);
    }

    function disable() {
        if (personButton) personButton.disabled = true;
        if (groupButton) groupButton.disabled = true;
    }

    function fail(message, status) {
        const el = status || personStatus;
        if (!el) return;
        el.textContent = message;
        el.className = 'status status-error';
    }

    // ---- the first screen ------------------------------------------------

    function showChoice() {
        role = null;
        panelEl.hidden = true;
        chooseEl.hidden = false;
        headHint.hidden = false;
        headHint.textContent = isTr()
            ? 'Dört başvuru yolu. Size uygun olanı seçin.'
            : 'Four ways to apply. Pick the one that describes you.';

        // Drop the role from the address so a reload lands on the first
        // screen rather than straight back into the form.
        if (location.search) {
            const url = new URL(location.href);
            url.searchParams.delete('as');
            history.replaceState(null, '', url);
        }

        window.scrollTo(0, 0);
        const first = chooseEl.querySelector('.choose-card');
        if (first) first.focus();
    }

    function showRole(next) {
        const config = ROLES[next];
        if (!config) return;

        role = config;
        chooseEl.hidden = true;
        panelEl.hidden = false;

        formTitle.textContent = t(config.title);
        formNote.textContent = t(config.note);
        headHint.hidden = true;

        const isGroup = next === 'group';
        personForm.hidden = isGroup;
        groupForm.hidden = !isGroup;

        // Admin and press are the committee, so there is nothing to pick.
        // Press asks for a camera model instead.
        prefsEl.hidden = !config.committees;
        if (cameraEl) cameraEl.hidden = !config.camera;
        if (motivationHint) {
            if (isTr()) {
                motivationHint.textContent = config.committees
                    ? 'Bu bilgi komite yerleşiminde bize yardımcı olur.'
                    : 'Bu bilgi başvurunuzu değerlendirirken bize yardımcı olur.';
            } else {
                motivationHint.textContent = config.committees
                    ? 'This helps us with committee allocation.'
                    : 'This helps us review your application.';
            }
        }

        personButton.textContent = t(config.button);
        groupButton.textContent = t(config.button);

        clearErrors(personForm);
        clearErrors(groupForm);
        setStatus(personStatus, '');
        setStatus(groupStatus, '');

        const url = new URL(location.href);
        url.searchParams.set('as', config.key);
        history.replaceState(null, '', url);

        window.scrollTo(0, 0);
        const focus = isGroup
            ? document.getElementById('f-group-type')
            : document.getElementById('f-name');
        if (focus) focus.focus();
    }

    for (const card of chooseEl.querySelectorAll('.choose-card')) {
        card.addEventListener('click', () => showRole(card.dataset.role));
    }

    backBtn.addEventListener('click', showChoice);

    // ---- shared form machinery -------------------------------------------

    function setStatus(el, message) {
        if (!el) return;
        el.textContent = message;
        el.className = 'status';
    }

    // Replaces the form rather than resetting it. A cleared form left on screen
    // with a disabled button reads as "did that work?", which is the one thing
    // the screen after a submission must never ask.
    function showDone(payload, title) {
        if (payload.email) doneEmail.textContent = payload.email;
        doneTitle.textContent = title;

        setStatus(personStatus, '');
        setStatus(groupStatus, '');

        headEl.hidden = true;
        chooseEl.hidden = true;
        panelEl.hidden = true;
        doneEl.hidden = false;

        window.scrollTo(0, 0);
        doneEl.focus();
    }

    function clearErrors(form) {
        for (const p of form.querySelectorAll('.err')) p.textContent = '';
        for (const el of form.querySelectorAll('.is-invalid')) {
            el.classList.remove('is-invalid');
        }
    }

    // Validates one form and returns true when it is clean. `fields` maps a
    // column name to an input id; the map decides what is looked at, so the
    // person form and the group form share the code without sharing inputs.
    //
    // `extra` runs the checks that belong to one form only — the T.C. number,
    // the committee picks and the consent box belong to the person form and
    // must not be looked for while the group form is on screen, or an
    // applicant who never ticked the hidden box could not submit at all.
    function validate(form, fields, extra) {
        clearErrors(form);
        let firstBad = null;

        const markBad = (el) => {
            if (el && !firstBad) firstBad = el;
        };

        const flag = (id, message) => {
            const el = document.getElementById(id);
            const err = form.querySelector(`[data-err-for="${id}"]`);
            if (err) err.textContent = message;
            if (el) {
                el.classList.add('is-invalid');
                markBad(el);
            }
        };

        for (const [name, id] of Object.entries(fields)) {
            const el = document.getElementById(id);
            if (!el) continue;

            const value = el.value.trim();
            let message = '';

            if (el.required && !value) {
                message = isTr() ? 'Bu alan zorunlu.' : 'This field is required.';
            } else if (el.type === 'email' && value &&
                       !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
                message = isTr() ? 'Geçerli bir e-posta adresi girin.' : 'Enter a valid email address.';
            } else if (el.type === 'number' && value) {
                // Catches 0, 1.5 and "12e3" as well as pasting text into a
                // number field, which some browsers allow.
                const count = Number(value);
                if (!Number.isInteger(count) || count < 1 || count > MAX_HEADCOUNT) {
                    message = isTr()
                        ? '1 ile ' + MAX_HEADCOUNT + ' arasında bir tam sayı girin.'
                        : 'Enter a whole number between 1 and ' + MAX_HEADCOUNT + '.';
                }
            } else if (el.minLength > 0 && value && value.length < el.minLength) {
                message = isTr() ? 'Lütfen biraz daha uzun yazın.' : 'Please write a little more.';
            }

            if (message) flag(id, message);
        }

        if (extra) extra(flag, markBad);

        if (firstBad) firstBad.focus();
        return !firstBad;
    }

    // The checks that belong to the person form alone.
    function checkPerson(flag, markBad) {
        // Only once a number has been typed; an empty field has no checksum.
        const tcEl = document.getElementById('f-tc');
        if (tcEl && tcEl.value.trim() && !isValidTC(tcEl.value.trim())) {
            flag('f-tc', isTr()
                ? 'Geçersiz T.C. Kimlik Numarası. 11 haneli ve doğrulanabilir olmalı.'
                : 'Invalid T.C. Identity Number. It must be 11 digits and pass the checksum.');
        }

        // A repeated pick means one committee three times, not three preferences.
        // The three selects share one error line under the group, so the line
        // carries the message and the select that repeats is the one marked
        // and focused. Flagging the first one regardless used to send people
        // to a choice that was perfectly fine.
        const seen = new Set();
        let repeated = null;
        for (const id of ['f-committee-1', 'f-committee-2', 'f-committee-3']) {
            const el = document.getElementById(id);
            const value = el ? el.value : '';
            if (!value) continue;
            if (seen.has(value) && !repeated) repeated = id;
            seen.add(value);
        }
        if (repeated) {
            const err = document.getElementById('err-committees');
            if (err) {
                err.textContent = isTr()
                    ? 'Aynı komiteyi birden fazla kez seçemezsiniz.'
                    : 'You cannot select the same committee more than once.';
            }
            const el = document.getElementById(repeated);
            if (el) {
                el.classList.add('is-invalid');
                markBad(el);
            }
        }

        // Art. 6 special-category data needs explicit consent; `required` alone
        // would block silently.
        const consentEl = document.getElementById(CONSENT_INPUT);
        if (consentEl && !consentEl.checked) {
            flag(CONSENT_INPUT, isTr()
                ? 'Başvuru için açık rıza vermeniz gerekiyor.'
                : 'You must give explicit consent to apply.');
        }
    }

    // Empty optional fields are omitted rather than sent as "", so the admin
    // table does not fill with blank-looking cells.
    function collect(form, fields) {
        const row = {};

        for (const [key, id] of Object.entries(fields)) {
            const el = document.getElementById(id);
            if (!el) continue;
            const value = el.value.trim();
            if (!value) continue;
            // The column is an integer; PostgREST would accept "8" but sending
            // the type the column actually declares keeps the value honest.
            row[key] = key === 'headcount' ? Number(value) : value;
        }

        return row;
    }

    // The submit dance both forms share: disable the button, say what is
    // happening, and either replace the form with the confirmation screen or
    // say what went wrong.
    async function send(form, table, payload, button, status, doneTitleText) {
        button.disabled = true;
        setStatus(status, isTr() ? 'Gönderiliyor…' : 'Submitting…');

        try {
            const { error } = await client
                .from(table)
                .insert(payload);

            if (error) {
                // 23505 is the unique violation on email: the same address has
                // already applied. Say so plainly instead of showing a code.
                // 42501 is the RLS rejection.
                if (error.code === '23505') {
                    fail(isTr()
                        ? 'Bu e-posta adresiyle daha önce başvuru yapılmış.'
                        : 'An application has already been made with this email address.', status);
                } else if (error.code === '42501') {
                    fail(isTr()
                        ? 'Başvuru gönderilemedi. Lütfen daha sonra tekrar deneyin.'
                        : 'This could not be submitted. Please try again later.', status);
                } else {
                    fail(isTr()
                        ? 'Bir hata oluştu. Lütfen tekrar deneyin.'
                        : 'Something went wrong. Please try again.', status);
                }
                console.error('insert failed', error);
                button.disabled = false;
                return;
            }

            clearErrors(form);
            showDone(payload, doneTitleText);

        } catch (err) {
            console.error('submit threw', err);
            fail(isTr()
                ? 'Bağlantı hatası. Lütfen tekrar deneyin.'
                : 'Connection error. Please try again.', status);
            button.disabled = false;
        }
    }

    // ---- the person form --------------------------------------------------

    personForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!validate(personForm, PERSON_FIELDS, checkPerson)) return;

        const payload = collect(personForm, PERSON_FIELDS);

        if (role && role.committees) {
            for (const [key, id] of Object.entries(COMMITTEE_FIELDS)) {
                const el = document.getElementById(id);
                if (!el) continue;
                const value = el.value.trim();
                if (value) payload[key] = value;
            }
        }

        if (role && role.camera) {
            const el = document.getElementById('f-camera');
            if (el) {
                const value = el.value.trim();
                if (value) payload.camera_model = value;
            }
        }

        // Stamped here, never read from the form.
        payload.application_type = role ? role.type : 'delegate';
        payload.consent_at = new Date().toISOString();
        payload.consent_version = CONSENT_VERSION;
        await send(personForm, 'applications', payload, personButton, personStatus,
            isTr() ? 'Başvuru alındı' : 'Application submitted');
    });

    // ---- the group form ---------------------------------------------------

    groupForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!validate(groupForm, GROUP_FIELDS)) return;

        const payload = collect(groupForm, GROUP_FIELDS);

        await send(groupForm, 'delegations', payload, groupButton, groupStatus,
            isTr() ? 'Delegasyon kaydedildi' : 'Delegation submitted');
    });

    // Language toggle updates on apply page
    window.addEventListener('ykmun:lang', () => {
        if (role) {
            formTitle.textContent = t(role.title);
            formNote.textContent = t(role.note);
            personButton.textContent = t(role.button);
            groupButton.textContent = t(role.button);
            if (motivationHint) {
                if (isTr()) {
                    motivationHint.textContent = role.committees
                        ? 'Bu bilgi komite yerleşiminde bize yardımcı olur.'
                        : 'Bu bilgi başvurunuzu değerlendirirken bize yardımcı olur.';
                } else {
                    motivationHint.textContent = role.committees
                        ? 'This helps us with committee allocation.'
                        : 'This helps us review your application.';
                }
            }
        } else if (headHint) {
            headHint.textContent = isTr()
                ? 'Dört başvuru yolu. Size uygun olanı seçin.'
                : 'Four ways to apply. Pick the one that describes you.';
        }
    });

    // ---- first paint ------------------------------------------------------

    const params = new URLSearchParams(location.search);
    const requested = params.get('as');

    // Lets the confirmation screen be inspected without writing a row to the
    // table. Localhost only, so it cannot be reached on the deployed site.
    const preview = params.get('preview');
    const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

    if (preview === 'done' && isLocal) {
        const isGroup = requested === 'group';
        showDone({ email: 'deniz@example.com' },
            isGroup ? 'Delegation submitted' : 'Application submitted');
    } else if (requested && ROLES[requested]) {
        showRole(requested);
    } else {
        showChoice();
    }
})();
