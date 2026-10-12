(() => {
    'use strict';

    const form = document.getElementById('apply-form');
    const status = document.getElementById('status');
    const submitBtn = document.getElementById('submit-btn');

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
        'Güvenlik Kurulu',
        'İnsan Hakları',
        'Çevre',
        'Ekonomik ve Finansal',
        'Başbakanlık Konseyi'
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
                message = 'Bu alan zorunlu.';
            } else if (el.type === 'email' && el.value.trim() &&
                       !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(el.value.trim())) {
                message = 'Geçerli bir e-posta adresi gir.';
            } else if (el.minLength > 0 && el.value.trim() &&
                       el.value.trim().length < el.minLength) {
                message = 'Biraz daha uzun yazmalısın.';
            }

            if (message) flag(id, message);
        }

        // Only once a number has been typed; an empty field has no checksum.
        const tcEl = document.getElementById('f-tc');
        if (tcEl && tcEl.value.trim() && !isValidTC(tcEl.value.trim())) {
            flag('f-tc', 'T.C. Kimlik No geçersiz. 11 haneli ve algoritmik olarak doğru olmalı.');
        }

        // A repeated pick means one committee three times, not three preferences.
        const picks = ['f-committee-1', 'f-committee-2', 'f-committee-3']
            .map((id) => (document.getElementById(id) || {}).value)
            .filter(Boolean);
        if (picks.length !== new Set(picks).size) {
            flag('f-committee-1', 'Aynı komiteyi birden fazla kez seçemezsin.');
        }

        // Art. 6 special-category data needs explicit consent; `required` alone
        // would block silently.
        const consentEl = document.getElementById(CONSENT_INPUT);
        if (consentEl && !consentEl.checked) {
            flag(CONSENT_INPUT, 'Başvuru için açık rıza vermen gerekiyor.');
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
