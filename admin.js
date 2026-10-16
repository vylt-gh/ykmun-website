(() => {
    'use strict';

    const form = document.getElementById('login-form');
    const lemail = document.getElementById('lemail');
    const lpass = document.getElementById('lpass');
    const loginErr = document.getElementById('login-err');
    const loginScreen = document.getElementById('login');
    const app = document.getElementById('app');
    const userBadge = document.getElementById('user-badge');
    const signoutBtn = document.getElementById('signout');
    const searchInput = document.getElementById('search');
    const statusFilter = document.getElementById('status-filter');
    const listEl = document.getElementById('list');
    const emptyEl = document.getElementById('empty');
    const countEl = document.getElementById('count');

    let client;
    let applications = [];

    try {
        const { url, publishableKey } = window.YKMUN_CONFIG;
        client = window.supabase.createClient(url, publishableKey);
    } catch (err) {
        // Almost always the CDN script failing to load.
        fail('Bağlantı kurulamadı. Lütfen sayfayı yenileyip tekrar dene.');
        console.error('supabase client init failed', err);
        return;
    }

    function fail(message) {
        loginErr.textContent = message;
    }

    function clearLoginError() {
        loginErr.textContent = '';
    }

    // ---- session --------------------------------------------------------

    client.auth.onAuthStateChange((_event, session) => {
        if (session) showApp(session.user);
        else showLogin();
    });

    client.auth.getSession().then(({ data: { session } }) => {
        if (session) showApp(session.user);
    });

    function showLogin() {
        loginScreen.style.display = 'flex';
        app.style.display = 'none';
        applications = [];
    }

    function showApp(user) {
        loginScreen.style.display = 'none';
        app.style.display = 'block';
        userBadge.textContent = (user && user.email ? user.email : 'Yetkili');
        loadApplications();
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearLoginError();
        const { error } = await client.auth.signInWithPassword({
            email: lemail.value.trim(),
            password: lpass.value
        });
        if (error) {
            // Supabase returns the same generic error for unknown-email and
            // wrong-password on purpose; don't leak which one it was.
            fail('E-posta veya şifre hatalı.');
        }
    });

    signoutBtn.addEventListener('click', async () => {
        await client.auth.signOut();
        lemail.value = '';
        lpass.value = '';
    });

    // ---- data -----------------------------------------------------------

    async function loadApplications() {
        const { data, error } = await client
            .from('applications')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            listEl.textContent = '';
            emptyEl.textContent = 'Başvurular yüklenemedi.';
            emptyEl.style.display = 'block';
            console.error('load failed', error);
            return;
        }

        applications = data || [];
        render();
    }

    function render() {
        const query = searchInput.value.trim().toLowerCase();
        const status = statusFilter.value;

        const rows = applications.filter((row) => {
            if (status && (row.status || 'pending') !== status) return false;
            if (!query) return true;
            return ['full_name', 'email', 'phone'].some((key) =>
                (row[key] || '').toLowerCase().includes(query)
            );
        });

        countEl.textContent = rows.length + ' başvuru';
        listEl.textContent = '';
        emptyEl.style.display = rows.length ? 'none' : 'block';

        for (const row of rows) {
            listEl.appendChild(buildCard(row));
        }
    }

    function buildCard(row) {
        const card = document.createElement('article');
        card.className = 'card';

        const head = document.createElement('div');
        head.className = 'card-head';

        const name = document.createElement('div');
        name.className = 'card-name';
        name.textContent = row.full_name || '(ad yok)';

        const pill = document.createElement('span');
        const status = row.status || 'pending';
        pill.className = 'status-pill status-' + status;
        pill.textContent = statusLabel(status);

        head.append(name, pill);

        const meta = document.createElement('div');
        meta.className = 'card-meta';

        // All three preferences, not just the first. The form collects them as
        // ranked choices and committee allocation needs the whole ordering —
        // showing only committee_1 hid the applicant's second and third.
        const preferences = [row.committee_1, row.committee_2, row.committee_3].filter(Boolean);
        const details = [row.email, row.phone].filter(Boolean);
        if (preferences.length) details.push('Tercih: ' + preferences.join(' · '));

        for (const value of details) {
            const span = document.createElement('span');
            span.textContent = value;
            meta.appendChild(span);
        }

        const actions = document.createElement('div');
        actions.className = 'card-actions';
        actions.append(
            selectRow('Durum', 'status', row.id, status,
                [['pending', 'Bekliyor'], ['accepted', 'Kabul edildi'], ['rejected', 'Reddedildi']]),
            textRow('1. tercih', 'committee_1', row.id, row.committee_1 || ''),
            selectRow('Ödeme', 'payment_state', row.id, row.payment_state || 'unpaid',
                [['unpaid', 'Ödenmedi'], ['partial', 'Kısmi'], ['paid_card', 'Kart'],
                 ['paid_transfer', 'Havale'], ['paid_cash', 'Nakit'], ['waived', 'İmkanlı']])
        );

        card.append(head, meta, actions);
        return card;
    }

    function selectRow(label, column, id, value, options) {
        const row = document.createElement('div');
        row.className = 'edit-row';

        const labelEl = document.createElement('label');
        labelEl.textContent = label;

        const select = document.createElement('select');
        for (const [val, text] of options) {
            const option = document.createElement('option');
            option.value = val;
            option.textContent = text;
            if (val === value) option.selected = true;
            select.appendChild(option);
        }
        select.addEventListener('change', () => save(column, id, select.value, select));

        row.append(labelEl, select);
        return row;
    }

    function textRow(label, column, id, value) {
        const row = document.createElement('div');
        row.className = 'edit-row';

        const labelEl = document.createElement('label');
        labelEl.textContent = label;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = value;
        input.addEventListener('change', () => save(column, id, input.value.trim(), input));

        row.append(labelEl, input);
        return row;
    }

    function statusLabel(status) {
        return { pending: 'Bekliyor', accepted: 'Kabul edildi', rejected: 'Reddedildi' }[status] || status;
    }

    // ---- writes ---------------------------------------------------------

    async function save(column, id, value, control) {
        const previous = control.dataset.previous;
        if (value === previous) return;

        control.disabled = true;
        const { error } = await client
            .from('applications')
            .update({ [column]: value })
            .eq('id', id);

        control.disabled = false;

        if (error) {
            // RLS rejects viewers with a policy error. Say so plainly rather
            // than surfacing the code, and put the control back.
            control.value = previous ?? '';
            console.error('save failed', error);
            alert('Kaydedilemedi. Yetkiniz olmayabilir ya da bağlantı koptu.');
            return;
        }

        control.dataset.previous = value;
        const row = applications.find((r) => r.id === id);
        if (row) row[column] = value;
        render();
    }

    searchInput.addEventListener('input', render);
    statusFilter.addEventListener('change', render);
})();