/* Builds the site menu and its drawer.
 *
 * The pages share no component system, so injecting the markup here is what
 * keeps the menu identical everywhere without copying it into each file. */

(() => {
    'use strict';

    // Committees are deliberately absent until there is content for them; an
    // empty section in the menu is worse than no section.
    const LINKS = [
        { href: 'home', label: 'Home' },
        { href: 'apply', label: 'Apply' },
        { href: 'delegation', label: 'Delegation' },
        { href: 'team', label: 'Team' },
        { href: 'kvkk', label: 'Privacy' }
    ];

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'nav-toggle';
    toggle.setAttribute('aria-label', 'Menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'nav-drawer');

    for (let i = 0; i < 3; i++) {
        toggle.appendChild(document.createElement('span'));
    }

    const drawer = document.createElement('div');
    drawer.className = 'nav-drawer';
    drawer.id = 'nav-drawer';
    drawer.hidden = true;

    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Main');

    for (const link of LINKS) {
        const anchor = document.createElement('a');
        anchor.href = link.href;
        anchor.textContent = link.label;
        nav.appendChild(anchor);
    }

    drawer.appendChild(nav);
    document.body.append(toggle, drawer);

    function setOpen(open) {
        drawer.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        document.body.classList.toggle('nav-open', open);
    }

    toggle.addEventListener('click', () => setOpen(drawer.hidden));

    // A click on the backdrop, rather than on a link, closes the drawer.
    drawer.addEventListener('click', (event) => {
        if (event.target === drawer) setOpen(false);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !drawer.hidden) setOpen(false);
    });
})();
