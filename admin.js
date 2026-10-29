(() => {
    'use strict';

    const app = document.getElementById('app');
    const userBadge = document.getElementById('user-badge');
    const signoutBtn = document.getElementById('signout');
    const searchInput = document.getElementById('search');
    const statusFilter = document.getElementById('status-filter');
    const listEl = document.getElementById('list');
    const emptyEl = document.getElementById('empty');
    const countEl = document.getElementById('count');
    const readonlyNote = document.getElementById('readonly-note');
    const tabsEl = document.querySelector('.tabs');

    const STATUS_OPTIONS = [['pending', 'Pending'], ['accepted', 'Accepted'], ['rejected', 'Rejected']];
    const PAYMENT_OPTIONS = [
        ['unpaid', 'Unpaid'], ['partial', 'Partial'], ['paid_card', 'Card'],
        ['paid_transfer', 'Transfer'], ['paid_cash', 'Cash'], ['waived', 'Waived']
    ];

    // Two tables, one panel. The card shape differs enough that each is built
    // separately, but everything around the list — tabs, search, status filter,
    // count, read-only note — is shared rather than duplicated per table.
    const VIEWS = {
        applications: {
            table: 'applications',
            noun: ['application', 'applications'],
            placeholder: 'Search name, email, phone...',
            searchKeys: ['full_name', 'email', 'phone'],
            card: buildApplicationCard
        },
        delegations: {
            table: 'delegations',
            noun: ['delegation', 'delegations'],
            placeholder: 'Search school, contact, email...',
            searchKeys: ['organisation', 'contact_name', 'email', 'group_type'],
            card: buildDelegationCard
        }
    };

    const rows = { applications: [], delegations: [] };
    const loadError = { applications: null, delegations: null };

    let client;
    let canEdit = false;
    let view = 'applications';

    // ---- session --------------------------------------------------------
    //
    // No login form lives on this page. auth.js owns the prompt, and the two
    // shared passwords are what decide the role; the panel only ever knows
    // which of the two accounts signed in.

    let prompting = false;

    function promptLogin() {
        if (prompting) return;
        prompting = true;
        app.style.display = 'none';
        rows.applications = [];
        rows.delegations = [];

        window.YKMUNAuth.openPrompt({
            onSuccess: async () => {
                prompting = false;
                await showApp();
            },
            // Backing out of the prompt sends you back to the public site:
            // there is no sign-in page to fall back to.
            onDismiss: () => {
                prompting = false;
                window.location.href = 'home';
            }
        });
    }

    async function showApp() {
        const session = await window.YKMUNAuth.getSession();

        if (!session) {
            promptLogin();
            return;
        }

        app.style.display = 'block';
        userBadge.textContent = window.YKMUNAuth.roleLabel(session) || 'Staff';
        canEdit = window.YKMUNAuth.role(session) === 'editor';
        readonlyNote.hidden = canEdit;
        await loadAll();
    }

    (async function init() {
        try {
            client = await window.YKMUNAuth.getClient();
        } catch (err) {
            // Almost always the CDN script failing to load.
            console.error('supabase client init failed', err);
            app.style.display = 'block';
            emptyEl.textContent = 'Could not connect. Refresh the page and try again.';
            emptyEl.style.display = 'block';
            return;
        }

        const session = await window.YKMUNAuth.getSession();
        if (session) showApp();
        else promptLogin();

        // A token that expires beyond recovery, or a sign-out in another tab,
        // drops straight back to the prompt.
        client.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT') promptLogin();
        });
    })();

    signoutBtn.addEventListener('click', async () => {
        await window.YKMUNAuth.signOut();
    });

    // ---- data -----------------------------------------------------------

    async function loadAll() {
        await Promise.all(Object.keys(VIEWS).map(load));
        render();
    }

    async function load(name) {
        const { data, error } = await client
            .from(VIEWS[name].table)
            .select('*')
            .order('created_at', { ascending: false });

        // Kept per table: if one is unreachable the other still works. This is
        // the state a half-applied migration leaves behind, and it should read
        // as "this tab is empty", not as a broken panel.
        loadError[name] = error || null;
        rows[name] = error ? [] : (data || []);

        if (error) console.error('load ' + name + ' failed', error);
    }

    function render() {
        const source = VIEWS[view];
        const query = searchInput.value.trim().toLowerCase();
        const status = statusFilter.value;

        const visible = rows[view].filter((row) => {
            if (status && (row.status || 'pending') !== status) return false;
            if (!query) return true;
            return source.searchKeys.some((key) =>
                (row[key] || '').toLowerCase().includes(query)
            );
        });

        countEl.textContent = visible.length + ' ' +
            (visible.length === 1 ? source.noun[0] : source.noun[1]);

        listEl.textContent = '';
        emptyEl.style.display = visible.length ? 'none' : 'block';
        emptyEl.textContent = loadError[view]
            ? 'Could not load ' + source.noun[1] + '.'
            : 'No matching ' + source.noun[1] + '.';

        for (const row of visible) {
            listEl.appendChild(source.card(row));
        }
    }

    // ---- tabs -----------------------------------------------------------

    function setView(next) {
        if (!VIEWS[next] || next === view) return;
        view = next;

        for (const tab of tabsEl.querySelectorAll('[data-view]')) {
            const active = tab.dataset.view === next;
            tab.classList.toggle('is-active', active);
            tab.setAttribute('aria-pressed', String(active));
        }

        searchInput.placeholder = VIEWS[next].placeholder;
        render();
    }

    tabsEl.addEventListener('click', (event) => {
        const tab = event.target.closest('[data-view]');
        if (tab) setView(tab.dataset.view);
    });

    // ---- cards ----------------------------------------------------------

    function buildApplicationCard(row) {
        const card = document.createElement('article');
        card.className = 'card';

        const head = document.createElement('div');
        head.className = 'card-head';

        const name = document.createElement('div');
        name.className = 'card-name';
        name.textContent = row.full_name || '(no name)';

        head.append(name, statusPill(row.status));

        const meta = document.createElement('div');
        meta.className = 'card-meta';

        // All three preferences, not just the first. The form collects them as
        // ranked choices and committee allocation needs the whole ordering —
        // showing only committee_1 hid the applicant's second and third.
        const preferences = [row.committee_1, row.committee_2, row.committee_3].filter(Boolean);
        const details = [row.email, row.phone].filter(Boolean);
        if (preferences.length) details.push('Preference: ' + preferences.join(' · '));

        for (const value of details) meta.appendChild(spanOf(value));

        const actions = document.createElement('div');
        actions.className = 'card-actions';

        // All three preferences are editable. They are applicant-supplied so
        // edits should be rare, but there is no reason one of the three should
        // be correctable while the other two are not.
        actions.append(
            selectRow('applications', 'Status', 'status', row.id, row.status || 'pending', STATUS_OPTIONS),
            textRow('applications', '1st choice', 'committee_1', row.id, row.committee_1 || ''),
            textRow('applications', '2nd choice', 'committee_2', row.id, row.committee_2 || ''),
            textRow('applications', '3rd choice', 'committee_3', row.id, row.committee_3 || ''),
            selectRow('applications', 'Payment', 'payment_state', row.id, row.payment_state || 'unpaid', PAYMENT_OPTIONS)
        );

        card.append(head, meta, actions);
        return card;
    }

    function buildDelegationCard(row) {
        const card = document.createElement('article');
        card.className = 'card';

        const head = document.createElement('div');
        head.className = 'card-head';

        const name = document.createElement('div');
        name.className = 'card-name';
        name.textContent = row.organisation || '(no name)';

        head.append(name, statusPill(row.status));

        const meta = document.createElement('div');
        meta.className = 'card-meta';

        const details = [row.group_type, row.contact_name, row.email].filter(Boolean);
        if (row.headcount) {
            details.push(row.headcount + (row.headcount === 1 ? ' delegate' : ' delegates'));
        }

        for (const value of details) meta.appendChild(spanOf(value));

        const actions = document.createElement('div');
        actions.className = 'card-actions';

        // Headcount is editable because schools revise it; it is the one number
        // staff are likely to need to correct without opening the dashboard.
        actions.append(
            selectRow('delegations', 'Status', 'status', row.id, row.status || 'pending', STATUS_OPTIONS),
            numberRow('delegations', 'Delegates', 'headcount', row.id, row.headcount)
        );

        card.append(head, meta, actions);
        return card;
    }

    function statusPill(value) {
        const status = value || 'pending';
        const pill = document.createElement('span');
        pill.className = 'status-pill status-' + status;
        pill.textContent = statusLabel(status);
        return pill;
    }

    function spanOf(value) {
        const span = document.createElement('span');
        span.textContent = value;
        return span;
    }

    // ---- controls -------------------------------------------------------

    function selectRow(table, label, column, id, value, options) {
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
        select.addEventListener('change', () => save(table, column, id, select.value, select));

        select.dataset.previous = value;
        select.disabled = !canEdit;

        row.append(labelEl, select);
        return row;
    }

    function textRow(table, label, column, id, value) {
        const row = document.createElement('div');
        row.className = 'edit-row';

        const labelEl = document.createElement('label');
        labelEl.textContent = label;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = value;
        input.addEventListener('change', () => save(table, column, id, input.value.trim(), input));

        input.dataset.previous = value;
        input.disabled = !canEdit;

        row.append(labelEl, input);
        return row;
    }

    function numberRow(table, label, column, id, value) {
        const row = document.createElement('div');
        row.className = 'edit-row';

        const labelEl = document.createElement('label');
        labelEl.textContent = label;

        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.max = '500';
        input.step = '1';
        input.value = value == null ? '' : String(value);

        input.addEventListener('change', () => {
            const next = input.value.trim();
            // The column is NOT NULL, so clearing the field reverts instead of
            // sending "" and failing the integer cast server-side.
            if (!next) {
                input.value = input.dataset.previous;
                return;
            }
            save(table, column, id, Number(next), input);
        });

        input.dataset.previous = input.value;
        input.disabled = !canEdit;

        row.append(labelEl, input);
        return row;
    }

    function statusLabel(status) {
        return { pending: 'Pending', accepted: 'Accepted', rejected: 'Rejected' }[status] || status;
    }

    // ---- writes ---------------------------------------------------------

    async function save(table, column, id, value, control) {
        const previous = control.dataset.previous;

        // Compared as strings: a number field arrives as a number while its
        // dataset copy is always a string, and 8 !== "8" would re-save an
        // unchanged value every time the field lost focus.
        if (String(value) === String(previous ?? '')) return;

        control.disabled = true;
        const { error } = await client
            .from(table)
            .update({ [column]: value })
            .eq('id', id);

        control.disabled = !canEdit;

        if (error) {
            // RLS rejects viewers with a policy error. Say so plainly rather
            // than surfacing the code, and put the control back.
            control.value = previous ?? '';
            console.error('save failed', error);
            alert('Could not save. You may not have permission, or the connection dropped.');
            return;
        }

        control.dataset.previous = value;
        const row = rows[table].find((r) => r.id === id);
        if (row) row[column] = value;
        render();
    }

    searchInput.addEventListener('input', render);
    statusFilter.addEventListener('change', render);
})();
