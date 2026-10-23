(() => {
    'use strict';

    const form = document.getElementById('apply-form');
    const status = document.getElementById('status');
    const submitBtn = document.getElementById('submit-btn');
    const headEl = document.getElementById('head');
    const doneEl = document.getElementById('done');
    const doneLead = document.getElementById('done-lead');
    const doneEmail = document.getElementById('done-email');

    // Input id for the one field that has always had a real column.
    const EMAIL_INPUT = 'f-email';

    // key -> column name (migration 0005). Keep stable.
    const COLUMN_FIELDS = {
        full_name: 'f-name',
        phone: 'f-phone',
        tc_number: 'f-tc',
        committee_1: 'f-committee-1',
        committee_2: 'f-committee-2',
        committee_3: 'f-committee-3',
        motivation: 'f-motivation'
    };

    // payment_state is absent on purpose: applicants are never asked for it.

    // All validated inputs, for the validation pass.
    const FIELDS = { email: EMAIL_INPUT, ...COLUMN_FIELDS };

    // Bump when kvkk.html changes what is being consented to.
    const CONSENT_VERSION = '2026-10-13';

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
        if (submitBtn) submitBtn.disabled = true;
    }

    function fail(message) {
        status.textContent = message;
        status.className = 'status status-error';
    }

    // Replaces the form rather than resetting it. A cleared form left on screen
    // with a disabled button reads as "did that work?", which is the one thing
    // the screen after a submission must never ask.
    function showDone(payload) {
        const first = (payload.full_name || '').trim().split(/\s+/)[0];
        if (first) {
            doneLead.textContent =
                'Thank you, ' + first + '. Your application is with the organizing team.';
        }
        if (payload.email) doneEmail.textContent = payload.email;

        status.textContent = '';
        headEl.hidden = true;
        form.hidden = true;
        doneEl.hidden = false;

        window.scrollTo(0, 0);
        doneEl.focus();
    }

    function clearErrors() {
        for (const p of document.querySelectorAll('.err')) p.textContent = '';
        for (const el of form.querySelectorAll('.is-invalid')) {
            el.classList.remove('is-invalid');
        }
    }

    // Marks the offending field so the styling follows.
    function validate() {
        clearErrors();
        let firstBad = null;

        const flag = (id, message) => {
            const el = document.getElementById(id);
            const err = form.querySelector(`[data-err-for="${id}"]`);
            if (err) err.textContent = message;
            if (el) {
                el.classList.add('is-invalid');
                if (!firstBad) firstBad = el;
            }
        };

        for (const [name, id] of Object.entries(FIELDS)) {
            const el = document.getElementById(id);
            if (!el) continue;

            let message = '';
            if (el.required && !el.value.trim()) {
                message = 'This field is required.';
            } else if (el.type === 'email' && el.value.trim() &&
                       !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(el.value.trim())) {
                message = 'Enter a valid email address.';
            } else if (el.minLength > 0 && el.value.trim() &&
                       el.value.trim().length < el.minLength) {
                message = 'Please write a little more.';
            }

            if (message) flag(id, message);
        }

        // Only once a number has been typed; an empty field has no checksum.
        const tcEl = document.getElementById('f-tc');
        if (tcEl && tcEl.value.trim() && !isValidTC(tcEl.value.trim())) {
            flag('f-tc', 'Invalid T.C. Identity Number. It must be 11 digits and pass the checksum.');
        }

        // A repeated pick means one committee three times, not three preferences.
        const picks = ['f-committee-1', 'f-committee-2', 'f-committee-3']
            .map((id) => (document.getElementById(id) || {}).value)
            .filter(Boolean);
        if (picks.length !== new Set(picks).size) {
            flag('f-committee-1', 'You cannot select the same committee more than once.');
        }

        // Art. 6 special-category data needs explicit consent; `required` alone
        // would block silently.
        const consentEl = document.getElementById(CONSENT_INPUT);
        if (consentEl && !consentEl.checked) {
            flag(CONSENT_INPUT, 'You must give explicit consent to apply.');
        }

        if (firstBad) firstBad.focus();
        return !firstBad;
    }

    function collect() {
        const emailEl = document.getElementById(EMAIL_INPUT);
        const row = {};

        for (const [key, id] of Object.entries(COLUMN_FIELDS)) {
            const el = document.getElementById(id);
            if (!el) continue;
            const value = el.value.trim();
            // Empty optional fields are omitted rather than sent as "", so the
            // admin table does not fill with blank-looking cells.
            if (value) row[key] = value;
        }

        // Stamped here, never read from the form.
        row.consent_at = new Date().toISOString();
        row.consent_version = CONSENT_VERSION;

        return {
            email: emailEl ? emailEl.value.trim() : '',
            ...row
        };
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!validate()) return;

        submitBtn.disabled = true;
        status.textContent = 'Submitting…';
        status.className = 'status';

        try {
            const payload = collect();
            const { error } = await client
                .from('applications')
                .insert(payload);

            if (error) {
                // 23505 is the unique violation on email: the same address has
                // already applied. Say so plainly instead of showing a code.
                if (error.code === '23505') {
                    fail('An application has already been made with this email address.');
                } else if (error.code === '42501') {
                    fail('Application could not be submitted. Please try again later.');
                } else {
                    fail('Something went wrong: ' + error.message);
                }
                console.error('insert failed', error);
                submitBtn.disabled = false;
                return;
            }

            clearErrors();
            showDone(payload);

        } catch (err) {
            console.error('submit threw', err);
            fail('Connection error. Please try again.');
            submitBtn.disabled = false;
        }
    });
})();
