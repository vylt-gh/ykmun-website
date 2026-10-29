(() => {
    'use strict';

    const form = document.getElementById('apply-form');
    const status = document.getElementById('status');
    const submitBtn = document.getElementById('submit-btn');
    const headEl = document.getElementById('head');
    const doneEl = document.getElementById('done');
    const doneEmail = document.getElementById('done-email');

    // column name -> input id. Keep stable; these are the columns in 0008.
    const FIELDS = {
        group_type: 'f-group-type',
        organisation: 'f-organisation',
        contact_name: 'f-contact',
        email: 'f-email',
        headcount: 'f-headcount'
    };

    const MAX_HEADCOUNT = 500;

    let client;

    try {
        const { url, publishableKey } = window.YKMUN_CONFIG;

        // Pins this client to `anon` no matter what is in the browser.
        //
        // Supabase keeps a session in localStorage on this origin, and the admin
        // panel uses the same origin — so a staff member who signed in there
        // would otherwise submit this form as `authenticated`, which has no
        // INSERT grant on delegations. persistSession:false is not enough on its
        // own; it governs writing, not reading. A storage adapter that always
        // returns null is what actually keeps the form anonymous. Same reasoning
        // as the client in apply.js.
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

    function showDone(payload) {
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

        for (const id of Object.values(FIELDS)) {
            const el = document.getElementById(id);
            if (!el) continue;

            const value = el.value.trim();
            let message = '';

            if (el.required && !value) {
                message = 'This field is required.';
            } else if (el.type === 'email' && value &&
                       !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
                message = 'Enter a valid email address.';
            } else if (el.type === 'number' && value) {
                // Catches 0, 1.5 and "12e3" as well as pasting text into a
                // number field, which some browsers allow.
                const count = Number(value);
                if (!Number.isInteger(count) || count < 1 || count > MAX_HEADCOUNT) {
                    message = 'Enter a whole number between 1 and ' + MAX_HEADCOUNT + '.';
                }
            } else if (el.minLength > 0 && value && value.length < el.minLength) {
                message = 'Please write a little more.';
            }

            if (message) flag(id, message);
        }

        if (firstBad) firstBad.focus();
        return !firstBad;
    }

    function collect() {
        const row = {};

        for (const [key, id] of Object.entries(FIELDS)) {
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

    // Lets the confirmation screen be inspected without writing a row.
    // Localhost only, so it cannot be reached on the deployed site.
    const preview = new URLSearchParams(location.search).get('preview');
    const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    if (preview === 'done' && isLocal) {
        showDone({ email: 'deniz@example.com' });
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!validate()) return;

        submitBtn.disabled = true;
        status.textContent = 'Submitting…';
        status.className = 'status';

        try {
            const { error } = await client
                .from('delegations')
                .insert(collect());

            if (error) {
                // 42501 is the RLS rejection; anything else is worth showing,
                // but a raw Postgres message is not. Log the detail, say
                // something a school can act on.
                fail(error.code === '42501'
                    ? 'This could not be submitted. Please try again later.'
                    : 'Something went wrong. Please try again.');
                console.error('insert failed', error);
                submitBtn.disabled = false;
                return;
            }

            clearErrors();
            showDone(collect());

        } catch (err) {
            console.error('submit threw', err);
            fail('Connection error. Please try again.');
            submitBtn.disabled = false;
        }
    });
})();
