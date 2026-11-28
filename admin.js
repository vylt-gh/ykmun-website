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

    function isPaidState(state) {
        return state === 'paid' || state === 'paid_card' || state === 'paid_transfer' ||
            state === 'paid_cash' || state === 'waived';
    }

    // What an applicant applied for. Mirrors the check constraint in migration
    // 0009 / 0011.
    const TYPE_LABELS = {
        delegate: 'Delegate',
        admin: 'Admin',
        press: 'Press',
        trainee: 'Trainee'
    };

    // Two tables, one panel. The card shape differs enough that each is built
    // separately, but everything around the list — tabs, search, status filter,
    // count, read-only note — is shared rather than duplicated per table.
    const VIEWS = {
        applications: {
            table: 'applications',
            noun: ['application', 'applications'],
            placeholder: 'Search name, email, phone, T.C. no...',
            searchKeys: ['full_name', 'email', 'phone', 'tc_number',
                'application_type', 'camera_model', 'school_grade'],
            // Everything a card shows, in one list. Used to decide whether the
            // cards on screen are already the right ones and can be left
            // alone — see paint().
            cardFields: ['id', 'full_name', 'status', 'email', 'phone',
                'birth_date', 'gender', 'school_grade', 'experience',
                'motivation', 'notes', 'committee_1', 'committee_2',
                'committee_3', 'payment_state', 'application_type',
                'camera_model', 'trainee_q1', 'trainee_q2', 'trainee_q3',
                'trainee_q4'],
            card: buildApplicationCard
        },
        delegations: {
            table: 'delegations',
            noun: ['delegation', 'delegations'],
            placeholder: 'Search school, contact, email...',
            searchKeys: ['organisation', 'contact_name', 'email', 'group_type'],
            cardFields: ['id', 'organisation', 'status', 'group_type',
                'contact_name', 'email', 'headcount'],
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

    // Signing out on purpose leaves the panel, so it must not be mistaken for
    // a session that expired: the SIGNED_OUT event that follows is on the
    // way out, not a request to sign back in.
    let leaving = false;

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
        // drops straight back to the prompt. A sign-out from this panel is
        // on its way to the home page instead, and must not be interrupted.
        client.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT' && !leaving) promptLogin();
        });
    })();

    signoutBtn.addEventListener('click', async () => {
        leaving = true;
        try {
            await window.YKMUNAuth.signOut();
        } catch (err) {
            console.error('sign out failed', err);
        }
        window.location.href = 'home';
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

    // The cards on screen, and the key they were painted from. A render that
    // would produce the same cards leaves them alone.
    let paintedKey = null;

    // Which rows match, and what the count says. Split out from the painting
    // because the two answer at different speeds: the count follows every
    // keystroke, the cards do not.
    function match() {
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

        return visible;
    }

    function paint(visible) {
        const source = VIEWS[view];

        // Every card carries five controls, so rebuilding the list is the
        // expensive part of this page. Keyed on what the cards would show: if
        // none of that changed, what is already on screen is correct and is
        // left untouched. The separators are control characters, which cannot
        // occur in the data, so two different lists cannot share a key.
        const key = view + '|' + (loadError[view] ? 'error' : 'ok') + '|' +
            visible.map((row) =>
                source.cardFields.map((field) => row[field]).join('\u0000')
            ).join('\u001f');

        if (key === paintedKey) return;
        paintedKey = key;

        listEl.textContent = '';
        emptyEl.style.display = visible.length ? 'none' : 'block';
        emptyEl.textContent = loadError[view]
            ? 'Could not load ' + source.noun[1] + '.'
            : 'No matching ' + source.noun[1] + '.';

        for (const row of visible) {
            listEl.appendChild(source.card(row));
        }
    }

    function render() {
        paint(match());
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

        // What they applied for, next to where they are in the review. An
        // admin or press applicant is not waiting for a committee seat, so
        // the two badges answer different questions.
        const pills = document.createElement('div');
        pills.className = 'card-pills';
        const paid = isPaidState(row.payment_state);
        pills.append(typePill(row.application_type), statusPill(row.status));
        if (paid) pills.append(paidPill());

        head.append(name, pills);

        const meta = document.createElement('div');
        meta.className = 'card-meta';

        const contact = [row.email, row.phone].filter(Boolean);
        if (contact.length) meta.appendChild(metaLine(contact.join(' · ')));

        const birthDate = row.birth_date && /^\d{4}-\d{2}-\d{2}$/.test(row.birth_date)
            ? row.birth_date.split('-').reverse().join('.')
            : row.birth_date;
        const profile = [birthDate, row.gender, row.school_grade].filter(Boolean);
        if (profile.length) meta.appendChild(metaLine(profile.join(' · ')));

        const preferences = [row.committee_1, row.committee_2, row.committee_3].filter(Boolean);
        if (preferences.length) meta.appendChild(metaLine('Committees: ' + preferences.join(' · ')));
        if (row.camera_model) meta.appendChild(metaLine('Camera: ' + row.camera_model));

        // Long-form text lives in a collapsed drawer so cards stay uniform and
        // scannable in the grid.
        const longFields = [
            ['Experience', row.experience],
            ['Motivation', row.motivation],
            ['Notes', row.notes],
            ['Scenario 1', row.trainee_q1],
            ['Scenario 2', row.trainee_q2],
            ['Scenario 3', row.trainee_q3],
            ['Scenario 4 (Crisis)', row.trainee_q4]
        ].filter(([, val]) => Boolean(val));

        let detailsEl = null;
        if (longFields.length) {
            detailsEl = document.createElement('details');
            detailsEl.className = 'card-details';

            const summary = document.createElement('summary');
            summary.className = 'card-details-toggle';
            summary.textContent = 'Responses (' + longFields.length + ')';
            detailsEl.appendChild(summary);

            const body = document.createElement('div');
            body.className = 'card-details-body';
            for (const [label, val] of longFields) {
                const block = document.createElement('div');
                block.className = 'detail-block';
                const lbl = document.createElement('span');
                lbl.className = 'detail-label';
                lbl.textContent = label;
                const txt = document.createElement('p');
                txt.className = 'detail-text';
                txt.textContent = val;
                block.append(lbl, txt);
                body.appendChild(block);
            }
            detailsEl.appendChild(body);
        }

        const actions = document.createElement('div');
        actions.className = 'card-actions';

        const isDelegate = (row.application_type || 'delegate') === 'delegate';
        const isPress = row.application_type === 'press';

        const bar = document.createElement('div');
        bar.className = 'action-bar';
        bar.append(
            selectRow('applications', 'Status', 'status', row.id, row.status || 'pending', STATUS_OPTIONS),
            checkboxRow('applications', 'Paid', 'payment_state', row.id, paid, 'paid', 'unpaid')
        );
        actions.appendChild(bar);

        if (isDelegate) {
            const prefs = document.createElement('div');
            prefs.className = 'edit-grid';
            prefs.append(
                textRow('applications', '1st', 'committee_1', row.id, row.committee_1 || ''),
                textRow('applications', '2nd', 'committee_2', row.id, row.committee_2 || ''),
                textRow('applications', '3rd', 'committee_3', row.id, row.committee_3 || '')
            );
            actions.appendChild(prefs);
        } else if (isPress) {
            actions.appendChild(
                textRow('applications', 'Camera', 'camera_model', row.id, row.camera_model || '')
            );
        }

        card.append(head, meta);
        if (detailsEl) card.appendChild(detailsEl);
        card.appendChild(actions);
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

    // Which kind of application this is. Rows written before migration 0009
    // have no type and are delegates, which is what the column defaults to.
    function typePill(value) {
        const type = value || 'delegate';
        const pill = document.createElement('span');
        pill.className = 'type-pill type-' + type;
        pill.textContent = TYPE_LABELS[type] || type;
        return pill;
    }

    function paidPill() {
        const pill = document.createElement('span');
        pill.className = 'paid-pill';
        pill.textContent = 'Paid';
        return pill;
    }

    function metaLine(text) {
        const line = document.createElement('div');
        line.className = 'card-meta-line';
        line.textContent = text;
        return line;
    }

    function spanOf(value) {
        const span = document.createElement('span');
        span.textContent = value;
        return span;
    }

    // ---- controls -------------------------------------------------------

    function checkboxRow(table, label, column, id, checked, onValue, offValue) {
        const row = document.createElement('label');
        row.className = 'check-row';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        input.dataset.previous = checked ? onValue : offValue;
        input.dataset.onValue = onValue;
        input.disabled = !canEdit;

        input.addEventListener('change', () => {
            save(table, column, id, input.checked ? onValue : offValue, input);
        });

        const text = document.createElement('span');
        text.textContent = label;

        row.append(input, text);
        return row;
    }

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
            if (control.type === 'checkbox') {
                control.checked = previous === control.dataset.onValue;
            } else {
                control.value = previous ?? '';
            }
            console.error('save failed', error);
            alert('Could not save. You may not have permission, or the connection dropped.');
            return;
        }

        control.dataset.previous = value;
        const row = rows[table].find((r) => r.id === id);
        if (row) row[column] = value;
        render();
    }

    // Typing in the search box matches against every row, and matching has to
    // be immediate for the count to feel live. The cards are the expensive
    // half, so they follow a short pause instead of every keystroke.
    let searchTimer = null;

    searchInput.addEventListener('input', () => {
        match();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(render, 150);
    });
    statusFilter.addEventListener('change', render);
})();
