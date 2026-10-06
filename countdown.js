(() => {
    'use strict';

    // The MUN opens on this date, at 09:00 local time. Change this one line to
    // move the countdown; everything else derives from it.
    const TARGET = new Date(2027, 0, 15, 9, 0, 0);
    const DAY_MS = 86400000;

    const slots = Array.from(document.querySelectorAll('.window'));
    const live = document.getElementById('countdown-text');

    let lastText = '';

    function midnight(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    }

    function daysLeft(now) {
        // Calendar days between today and the opening day, so the figure steps
        // over at local midnight rather than drifting by 24h blocks (DST).
        return Math.round((midnight(TARGET) - midnight(now)) / DAY_MS);
    }

    function render(now) {
        const days = daysLeft(now);

        if (days <= 0) {
            slots.forEach((slot) => {
                slot.textContent = '0';
            });
            if (lastText !== 'done') {
                lastText = 'done';
                live.textContent = 'YKMUN başladı.';
            }
            return;
        }

        const text = String(days);
        if (text === lastText) return;
        lastText = text;

        // The plate has three painted cards, so the day count is zero-padded to
        // three digits. A count above 999 would overflow the windows and needs
        // revisiting then, not now.
        const padded = text.padStart(3, '0');
        slots.forEach((slot, i) => {
            slot.textContent = padded[i];
        });

        live.textContent = days + ' gün kaldı.';
    }

    function tick() {
        render(new Date());
        // Re-check on the next minute: the figure only changes at midnight, but
        // this keeps the page correct after a sleep or a clock change.
        setTimeout(tick, 60000 - (Date.now() % 60000));
    }

    tick();
})();