/* Shared staff sign-in.
 *
 * There are no individual accounts. Two exist — one per role — and every
 * member of a team uses the same password for their role. What changed from
 * the previous model is that the panel no longer has a login form, and staff
 * reach it through an unmarked hotspot on the countdown plate.
 *
 * Supabase auth is still doing the real work underneath. That is not optional:
 * migration 0002 revokes read/write on applications from `anon` and grants it
 * to `authenticated`, and the policies read the caller's role out of
 * private.staff. A "password checked in JavaScript" scheme would either put
 * the password in this file or hand every reader the publishable key with no
 * role gate at all.
 *
 * The hidden hotspot is obscurity, not security. This file is public and
 * anyone can read it, find the account addresses, and post to the auth
 * endpoint directly. The only things protecting the applicant data are the
 * password strength and Supabase's own rate limiting.
 */
(() => {
    'use strict';

    const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';

    // Tried in order. The editor password is attempted first, so a viewer
    // spends one failed attempt per sign-in; that is invisible to them and
    // cheap, whereas asking people to pick a role would leak which roles
    // exist and invite the wrong pick.
    const ACCOUNTS = [
        { email: 'editor@ykmun.org', label: 'Editor' },
        { email: 'viewer@ykmun.org', label: 'Viewer' }
    ];

    let client = null;
    let sdkPromise = null;
    let activeDialog = null;

    // The landing page does not load the Supabase SDK: almost nobody who sees
    // it will ever sign in, and a ~100kB download on every visit to the splash
    // is a bad trade. It is fetched on the first password submission instead.
    function loadSdk() {
        if (window.supabase) return Promise.resolve();
        if (sdkPromise) return sdkPromise;

        sdkPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = SDK_URL;
            script.onload = resolve;
            script.onerror = () => reject(new Error('sdk unavailable'));
            document.head.appendChild(script);
        });

        return sdkPromise;
    }

    async function getClient() {
        if (client) return client;
        await loadSdk();
        const { url, publishableKey } = window.YKMUN_CONFIG;
        client = window.supabase.createClient(url, publishableKey);
        return client;
    }

    function isBadCredentials(error) {
        return !!error && (error.code === 'invalid_credentials'
            || /invalid login credentials/i.test(error.message || ''));
    }

    function isRateLimited(error) {
        return !!error && (error.status === 429
            || /rate limit|too many requests/i.test(error.message || ''));
    }

    // Returns the matching account, or null if every account rejected the
    // password. Throws for anything that is not a credential mismatch, so a
    // network failure or a rate limit is never reported as "wrong password".
    async function signIn(password) {
        const supabaseClient = await getClient();

        for (const account of ACCOUNTS) {
            const { error } = await supabaseClient.auth.signInWithPassword({
                email: account.email,
                password
            });

            if (!error) return account;
            if (!isBadCredentials(error)) throw error;
        }

        return null;
    }

    async function getSession() {
        const supabaseClient = await getClient();
        const { data } = await supabaseClient.auth.getSession();
        return data.session || null;
    }

    async function signOut() {
        const supabaseClient = await getClient();
        await supabaseClient.auth.signOut();
    }

    function roleLabel(session) {
        const email = session && session.user && session.user.email;
        const match = ACCOUNTS.find((account) => account.email === email);
        return match ? match.label : '';
    }

    function describe(error) {
        if (isRateLimited(error)) {
            return 'Too many attempts. Try again in a few minutes.';
        }
        if (/sdk unavailable|failed to fetch|network/i.test(error.message || '')) {
            return 'Could not connect. Check your internet connection.';
        }
        return 'Sign-in failed.';
    }

    // Builds the prompt on demand rather than keeping it in the markup, so it
    // does not appear in the page source of the landing page.
    function openPrompt({ onSuccess, onDismiss } = {}) {
        if (activeDialog) {
            activeDialog.input.focus();
            return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'auth-overlay';

        const form = document.createElement('form');
        form.className = 'auth-dialog';
        form.setAttribute('role', 'dialog');
        form.setAttribute('aria-modal', 'true');
        form.setAttribute('aria-labelledby', 'auth-title');

        const title = document.createElement('h2');
        title.id = 'auth-title';
        title.textContent = 'Staff sign-in';

        const label = document.createElement('label');
        label.htmlFor = 'auth-pass';
        label.textContent = 'Password';

        const input = document.createElement('input');
        input.type = 'password';
        input.id = 'auth-pass';
        input.autocomplete = 'current-password';
        input.required = true;

        const error = document.createElement('p');
        error.className = 'auth-err';
        error.setAttribute('role', 'alert');

        const actions = document.createElement('div');
        actions.className = 'auth-actions';

        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'auth-cancel';
        cancel.textContent = 'Cancel';

        const submit = document.createElement('button');
        submit.type = 'submit';
        submit.className = 'auth-submit';
        submit.textContent = 'Sign in';

        actions.append(cancel, submit);
        form.append(title, label, input, error, actions);
        overlay.appendChild(form);
        document.body.appendChild(overlay);

        activeDialog = { overlay, input };

        const onKey = (event) => {
            if (event.key === 'Escape') dismiss();
        };

        function teardown() {
            document.removeEventListener('keydown', onKey);
            overlay.remove();
            activeDialog = null;
        }

        function dismiss() {
            if (!activeDialog) return;
            teardown();
            if (onDismiss) onDismiss();
        }

        function setBusy(busy) {
            submit.disabled = busy;
            input.disabled = busy;
            submit.textContent = busy ? '…' : 'Sign in';
        }

        cancel.addEventListener('click', dismiss);

        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) dismiss();
        });

        document.addEventListener('keydown', onKey);

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const password = input.value;
            if (!password) return;

            setBusy(true);
            error.textContent = '';

            try {
                const account = await signIn(password);

                if (!account) {
                    error.textContent = 'Incorrect password.';
                    setBusy(false);
                    input.select();
                    return;
                }

                teardown();
                if (onSuccess) await onSuccess(account);
            } catch (err) {
                console.error('sign-in failed', err);
                error.textContent = describe(err);
                setBusy(false);
            }
        });

        input.focus();
    }

    window.YKMUNAuth = {
        getClient,
        getSession,
        signIn,
        signOut,
        roleLabel,
        openPrompt
    };

    // The landing page's hidden trigger. Wired here rather than with an inline
    // script so the page stays free of sign-in logic, and so a page without the
    // element simply does nothing.
    const trigger = document.getElementById('staff-entry');

    if (trigger) {
        trigger.addEventListener('click', () => {
            openPrompt({
                onSuccess: () => {
                    window.location.href = 'admin';
                }
            });
        });
    }
})();
