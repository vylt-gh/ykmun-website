(() => {
    'use strict';

    const CONFIG = {
        radiusGain: 1.6,
        minRadius: 1.2,
        maxRadius: 16,
        spriteSize: 64,
        fieldRadius: 196,
        strength: 29000,
        falloffPow: 1.25,
        speedBoost: 1.25,
        maxSpeed: 2600,
        spring: 55,
        damping: 7.5,
        restSpeed: 0.6,
        restOffset: 0.4
    };

    const canvas = document.getElementById('stars');
    const ctx = canvas.getContext('2d');

    const pointer = { x: 0, y: 0, vx: 0, vy: 0, active: false };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

    let stars = [];
    let source = { w: 1, h: 1 };
    let field = CONFIG.fieldRadius;
    let sprite = null;
    let frame = 0;
    let last = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;

    init();

    function init() {
        // Star geometry is precomputed into stars-data.js by tools/gen-stars-data.py.
        // It is data rather than a loaded image on purpose: a file:// image taints
        // the canvas (browsers give each file a unique origin), which makes
        // getImageData throw, so the starfield would never appear when the page is
        // opened straight from disk.
        const data = window.STAR_FIELD;
        if (!data || !data.stars.length) {
            console.warn('starfield unavailable, gradient background only');
            return;
        }

        source = { w: data.w, h: data.h };
        stars = data.stars.map(([ix, iy, span, peak]) => ({
            ix,
            iy,
            hx: 0,
            hy: 0,
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            r: Math.min(
                CONFIG.maxRadius,
                Math.max(CONFIG.minRadius, span * 0.5 * CONFIG.radiusGain)
            ),
            a: peak / 255
        }));

        sprite = buildSprite(CONFIG.spriteSize);
        resize();
        window.addEventListener('resize', resize);
        window.addEventListener('pointermove', onPointerMove, { passive: true });
        window.addEventListener('pointerdown', onPointerMove, { passive: true });
        window.addEventListener('pointerleave', onPointerLeave);
        window.addEventListener('blur', onPointerLeave);
        document.addEventListener('visibilitychange', onVisibilityChange);
        reduced.addEventListener('change', render);
        render();
    }

    function buildSprite(size) {
        const half = size / 2;
        const out = document.createElement('canvas');
        out.width = size;
        out.height = size;
        const c = out.getContext('2d');
        const glow = c.createRadialGradient(half, half, 0, half, half, half);
        glow.addColorStop(0, 'rgba(255,255,255,1)');
        glow.addColorStop(0.2, 'rgba(255,255,255,0.62)');
        glow.addColorStop(0.5, 'rgba(255,255,255,0.17)');
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = glow;
        c.fillRect(0, 0, size, size);
        return out;
    }

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = document.documentElement.clientWidth;
        height = document.documentElement.clientHeight;

        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';

        field = Math.min(
            CONFIG.fieldRadius,
            Math.max(128, Math.min(width, height) * 0.36)
        );

        if (stars.length) {
            const scale = Math.max(width / source.w, height / source.h);
            const ox = (width - source.w * scale) / 2;
            const oy = (height - source.h * scale) / 2;
            for (const star of stars) {
                star.hx = star.ix * scale + ox;
                star.hy = star.iy * scale + oy;
                if (!star.x) {
                    star.x = star.hx;
                    star.y = star.hy;
                }
            }
        }
        render();
    }

    function onPointerMove(event) {
        const x = event.clientX;
        const y = event.clientY;
        if (pointer.active) {
            pointer.vx = x - pointer.x;
            pointer.vy = y - pointer.y;
        }
        pointer.x = x;
        pointer.y = y;
        pointer.active = true;
        start();
    }

    function onPointerLeave() {
        pointer.active = false;
        pointer.vx = 0;
        pointer.vy = 0;
    }

    function onVisibilityChange() {
        if (document.hidden) {
            stop();
        } else if (stars.length) {
            render();
        }
    }

    function start() {
        if (frame || reduced.matches || !stars.length) return;
        last = performance.now();
        frame = requestAnimationFrame(tick);
    }

    function stop() {
        if (!frame) return;
        cancelAnimationFrame(frame);
        frame = 0;
    }

    function tick(now) {
        const dt = Math.min((now - last) / 1000, 1 / 30);
        last = now;

        const settling = step(dt);
        draw();

        if (settling) {
            stop();
        } else {
            frame = requestAnimationFrame(tick);
        }
    }

    function step(dt) {
        const { strength, spring, damping, maxSpeed } = CONFIG;
        const fieldRadius = field;
        const falloffPow = CONFIG.falloffPow;
        const reach = fieldRadius * fieldRadius;
        const decay = Math.exp(-damping * dt);
        const drag = pointer.active
            ? 1 + (Math.min(Math.hypot(pointer.vx, pointer.vy) / 14, 1)) * CONFIG.speedBoost
            : 1;

        let active = false;

        for (const star of stars) {
            let vx = star.vx;
            let vy = star.vy;

            if (pointer.active) {
                const dx = star.x - pointer.x;
                const dy = star.y - pointer.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < reach && d2 > 0.01) {
                    const d = Math.sqrt(d2);
                    const falloff = 1 - d / fieldRadius;
                    const push = strength * Math.pow(falloff, falloffPow) * drag * dt / d;
                    vx += dx * push;
                    vy += dy * push;
                }
            }

            vx += (star.hx - star.x) * spring * dt;
            vy += (star.hy - star.y) * spring * dt;
            vx *= decay;
            vy *= decay;

            const speed = Math.hypot(vx, vy);
            if (speed > maxSpeed) {
                vx = (vx / speed) * maxSpeed;
                vy = (vy / speed) * maxSpeed;
            }

            star.vx = vx;
            star.vy = vy;
            star.x += vx * dt;
            star.y += vy * dt;

            if (
                speed > CONFIG.restSpeed ||
                Math.abs(star.x - star.hx) > CONFIG.restOffset ||
                Math.abs(star.y - star.hy) > CONFIG.restOffset
            ) {
                active = true;
            }
        }

        pointer.vx *= decay;
        pointer.vy *= decay;

        return !active;
    }

    function draw() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        if (!stars.length) return;

        const pad = CONFIG.maxRadius;
        ctx.globalCompositeOperation = 'lighter';

        for (const star of stars) {
            if (
                star.x < -pad ||
                star.y < -pad ||
                star.x > width + pad ||
                star.y > height + pad
            ) {
                continue;
            }
            const r = star.r;
            ctx.globalAlpha = star.a;
            ctx.drawImage(sprite, star.x - r, star.y - r, r * 2, r * 2);
        }

        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }

    function render() {
        if (reduced.matches) {
            stop();
            for (const star of stars) {
                star.x = star.hx;
                star.y = star.hy;
                star.vx = 0;
                star.vy = 0;
            }
        }
        draw();
        if (pointer.active && !reduced.matches) start();
    }
})();