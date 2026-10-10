(() => {
    'use strict';

    const form = document.getElementById('apply-form');
    const status = document.getElementById('status');
    const submitBtn = document.getElementById('submit-btn');

    // Input id for the one field that has a real database column. Everything
    // else lands in the `details` jsonb column from migration 0001, because the
    // real field list has not been decided. That keeps a field change to a
    // one-line edit here instead of a schema migration.
    const EMAIL_INPUT = 'f-email';

    // Everything except the email, as key -> input id. Key is the name used
    // inside `details`, so keep it stable: it is what the admin table shows.
    const DETAIL_FIELDS = {
        full_name: 'f-name',
        phone: 'f-phone',
        school: 'f-school',
        grade_level: 'f-grade',
        committee: 'f-committee',
        motivation: 'f-motivation',
        experience: 'f-experience'
    };

    // All validated inputs, for the validation pass.
    const FIELDS = { email: EMAIL_INPUT, ...DETAIL_FIELDS };

    let client;

    try {
        const { url, publishableKey } = window.YKMUN_CONFIG;
        client = window.supabase.createClient(url, publishableKey);
    } catch (err) {
        // Almost always the CDN script failing to load, which a real visitor on
        // a flaky connection can hit. Say so rather than failing on submit.
        fail('Bağlantı kurulamadı. Lütfen sayfayı yenileyip tekrar dene.');
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

    function clearErrors() {
        for (const p of document.querySelectorAll('.err')) p.textContent = '';
        for (const el of form.querySelectorAll('.is-invalid')) {
            el.classList.remove('is-invalid');
        }
    }

    // Reports the browser's own validation messages in Turkish where we can,
    // and always marks the field so the styling follows.
    function validate() {
        clearErrors();
        let firstBad = null;

        for (const [name, id] of Object.entries(FIELDS)) {
            const el = document.getElementById(id);
            if (!el) continue;

            let message = '';
            if (el.required && !el.value.trim()) {
                message = 'Bu alan zorunlu.';
            } else if (el.type === 'email' && el.value.trim() &&
                       !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(el.value.trim())) {
                message = 'Geçerli bir e-posta adresi gir.';
            } else if (el.minLength > 0 && el.value.trim() &&
                       el.value.trim().length < el.minLength) {
                message = 'Biraz daha uzun yazmalısın.';
            }

            if (message) {
                const err = form.querySelector(`[data-err-for="${id}"]`);
                if (err) err.textContent = message;
                el.classList.add('is-invalid');
                if (!firstBad) firstBad = el;
            }
        }

        if (firstBad) firstBad.focus();
        return !firstBad;
    }

    function collect() {
        const emailEl = document.getElementById(EMAIL_INPUT);
        const details = {};

        for (const [key, id] of Object.entries(DETAIL_FIELDS)) {
            const el = document.getElementById(id);
            if (!el) continue;
            const value = el.value.trim();
            // Empty optional fields are omitted rather than sent as "", so the
            // admin table does not fill with blank-looking cells.
            if (value) details[key] = value;
        }

        return {
            email: emailEl ? emailEl.value.trim() : '',
            details
        };
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!validate()) return;

        submitBtn.disabled = true;
        status.textContent = 'Gönderiliyor…';
        status.className = 'status';

        try {
            const { error } = await client
                .from('applications')
                .insert(collect());

            if (error) {
                // 23505 is the unique violation on email: the same address has
                // already applied. Say so plainly instead of showing a code.
                if (error.code === '23505') {
                    fail('Bu e-posta adresiyle daha önce başvuru yapılmış.');
                } else if (error.code === '42501') {
                    fail('Başvuru gönderilemedi. Lütfen daha sonra tekrar dene.');
                } else {
                    fail('Bir hata oluştu: ' + error.message);
                }
                console.error('insert failed', error);
                submitBtn.disabled = false;
                return;
            }

            form.reset();
            clearErrors();
            status.textContent = 'Başvurun alındı. Teşekkürler!';
            status.className = 'status status-ok';
            submitBtn.disabled = true;

        } catch (err) {
            console.error('submit threw', err);
            fail('Bağlantı hatası. Lütfen tekrar dene.');
            submitBtn.disabled = false;
        }
    });
})();
