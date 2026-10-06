/* =========================================================
   Intro en video + transición mágica hacia la invitación
   ---------------------------------------------------------
   Flujo:
   1. El video aparece en pausa. Al tocar cualquier parte de la
      pantalla arranca el video (sin sonido) y la música de fondo.
   2. Se reproduce intro.mp4 a pantalla completa.
   3. Al final del video (que termina en un destello dorado),
      la pantalla se ilumina, la portada "florece" detrás de la luz,
      estallan chispas doradas y caen pétalos de rosa.
   4. El nombre aparece letra por letra.
   5. Al bajar, cada sección aparece con un brillo suave.
   ========================================================= */
(function () {
    'use strict';

    const html = document.documentElement;
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Activa los estilos de la intro solo si este script cargó bien.
    html.classList.add('xv-intro-ready', 'xv-locked');

    let layer, video, skipBtn, flash, canvas, tapHint;
    let state = 'idle'; // idle | playing | finishing | done
    let videoFailed = false;
    let safetyTimer = null;

    function $(id) { return document.getElementById(id); }

    function init() {
        layer = $('introLayer');
        video = $('introVideo');
        skipBtn = $('introSkip');
        flash = $('introFlash');
        canvas = $('magicCanvas');
        tapHint = $('introTap');

        splitName();
        setupScrollReveal();

        // Espera el toque: cualquier parte de la pantalla inicia todo.
        if (layer) {
            layer.classList.add('is-waiting');
            layer.addEventListener('click', onTap);
            document.addEventListener('keydown', (e) => {
                if (state === 'idle' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onTap(); }
            });
        }

        if (!video) { videoFailed = true; return; }

        video.addEventListener('error', () => { videoFailed = true; if (state === 'playing') finish(); }, true);
        video.addEventListener('playing', () => {
            clearTimeout(safetyTimer);
            layer.classList.add('is-running');
        });
        video.addEventListener('timeupdate', () => {
            // El video termina en un destello: empalmamos la luz un poquito antes.
            if (state === 'playing' && video.duration && video.currentTime >= video.duration - 0.45) finish();
        });
        video.addEventListener('ended', () => { if (state === 'playing') finish(); });
        video.addEventListener('waiting', () => layer && layer.classList.add('is-buffering'));
        video.addEventListener('canplay', () => layer && layer.classList.remove('is-buffering'));

        if (skipBtn) skipBtn.addEventListener('click', (e) => { e.stopPropagation(); finish(); });
        // Al tocar durante el video no pasa nada (evita saltos accidentales).
    }

    function canPlay() {
        return !!video && !videoFailed && video.canPlayType('video/mp4') !== '';
    }

    function onTap() {
        if (state !== 'idle') return;
        // La música arranca en este mismo toque (requisito de iPhone/Android).
        if (typeof window.startMusic === 'function') window.startMusic();
        start();
    }

    function start() {
        if (state !== 'idle') return;
        if (layer) layer.classList.remove('is-waiting');
        if (!canPlay()) { finish(); return; }

        state = 'playing';
        layer.classList.add('is-playing');
        video.muted = true; // el video no lleva sonido, solo la música de fondo
        try { video.currentTime = 0; } catch (e) {}

        const p = video.play();
        if (p && typeof p.catch === 'function') p.catch(() => finish());

        // Botón "Saltar" aparece después de un momento.
        setTimeout(() => skipBtn && state === 'playing' && skipBtn.classList.add('is-visible'), 1800);
        // Si en 8 s el video no ha arrancado (conexión muy lenta), seguimos.
        safetyTimer = setTimeout(() => {
            if (state === 'playing' && (video.paused || video.currentTime < 0.1)) finish();
        }, 8000);
    }

    function finish() {
        if (state === 'finishing' || state === 'done') return;
        state = 'finishing';
        clearTimeout(safetyTimer);

        if (flash) flash.classList.add('is-on');
        if (skipBtn) skipBtn.classList.remove('is-visible');

        setTimeout(() => {
            if (layer) layer.classList.add('is-gone');
            try { video.pause(); } catch (e) {}
            reveal();
        }, 520);
    }

    function reveal() {
        state = 'done';
        html.classList.remove('xv-locked');
        html.classList.add('xv-revealed');
        window.scrollTo(0, 0);

        if (flash) {
            flash.classList.add('is-on');
            // Doble rAF para que el navegador pinte el destello antes de disolverlo.
            // Un instante de luz plena (empalma con el destello del video) y se disuelve.
            setTimeout(() => flash.classList.add('is-out'), 260);
            setTimeout(() => { flash.style.display = 'none'; }, 2900);
        }
        if (layer) setTimeout(() => { layer.style.display = 'none'; }, 700);

        if (typeof window.showMusicButton === 'function') window.showMusicButton();
        if (!reduceMotion) Magic.run();
    }

    /* ---------- Nombre letra por letra ---------- */
    function splitName() {
        const el = document.querySelector('.hero-text .names');
        if (!el || el.dataset.split) return;
        const text = el.textContent.trim();
        el.dataset.split = '1';
        el.setAttribute('aria-label', text);
        el.textContent = '';
        [...text].forEach((ch, i) => {
            const s = document.createElement('span');
            s.className = 'xv-letter';
            s.setAttribute('aria-hidden', 'true');
            s.style.setProperty('--i', i);
            s.textContent = ch === ' ' ? '\u00A0' : ch;
            el.appendChild(s);
        });
    }

    /* ---------- Aparición suave al hacer scroll ---------- */
    function setupScrollReveal() {
        const targets = document.querySelectorAll(
            '.content section, .content .footer, .content .section-divider'
        );
        if (!('IntersectionObserver' in window) || reduceMotion) return;
        targets.forEach(t => t.classList.add('xv-reveal'));
        const io = new IntersectionObserver((entries) => {
            entries.forEach(en => {
                if (en.isIntersecting) {
                    en.target.classList.add('is-in');
                    io.unobserve(en.target);
                }
            });
        }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
        targets.forEach(t => io.observe(t));
    }

    /* ---------- Chispas doradas + pétalos (canvas) ---------- */
    const Magic = {
        ctx: null, w: 0, h: 0, dpr: 1,
        sparks: [], petals: [], start: 0, raf: 0,

        resize() {
            this.dpr = Math.min(window.devicePixelRatio || 1, 2);
            this.w = window.innerWidth;
            this.h = window.innerHeight;
            canvas.width = this.w * this.dpr;
            canvas.height = this.h * this.dpr;
            canvas.style.width = this.w + 'px';
            canvas.style.height = this.h + 'px';
            this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        },

        run() {
            if (!canvas || !canvas.getContext) return;
            this.ctx = canvas.getContext('2d');
            this.resize();
            window.addEventListener('resize', () => this.resize());
            canvas.classList.add('is-active');

            const small = this.w < 768;
            const cx = this.w / 2, cy = this.h * 0.48;

            // Estallido dorado que continúa el destello del video
            const nSparks = small ? 90 : 150;
            for (let i = 0; i < nSparks; i++) {
                const a = Math.random() * Math.PI * 2;
                const sp = 2 + Math.random() * (small ? 7 : 10);
                this.sparks.push({
                    x: cx, y: cy,
                    vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                    r: 0.8 + Math.random() * 2.4,
                    life: 0, max: 70 + Math.random() * 70,
                    tw: Math.random() * Math.PI * 2
                });
            }

            // Pétalos que caen durante unos segundos
            this.petalBudget = small ? 30 : 55;
            this.start = performance.now();
            this.lastSpawn = 0;
            // Primera tanda ya repartida en la parte de arriba
            for (let i = 0; i < (small ? 8 : 14); i++) this.addPetal(true);

            cancelAnimationFrame(this.raf);
            const loop = (t) => {
                this.frame(t);
                if (this.sparks.length || this.petals.length || this.petalBudget > 0) {
                    this.raf = requestAnimationFrame(loop);
                } else {
                    this.ctx.clearRect(0, 0, this.w, this.h);
                    canvas.classList.remove('is-active');
                }
            };
            this.raf = requestAnimationFrame(loop);
        },

        addPetal(spread) {
            if (this.petalBudget <= 0) return;
            this.petalBudget--;
            const palette = [
                ['#F9D2DD', '#E28CA6'],
                ['#F4BFCF', '#D2778F'],
                ['#FCE0E8', '#E7A0B4'],
                ['#EFB0C2', '#C0647E']
            ];
            const c = palette[(Math.random() * palette.length) | 0];
            const size = 6 + Math.random() * 8;
            this.petals.push({
                x: Math.random() * this.w,
                y: spread ? -20 - Math.random() * this.h * 0.5 : -30,
                s: size,
                vy: 0.6 + Math.random() * 0.9,
                sway: 0.6 + Math.random() * 1.4,
                phase: Math.random() * Math.PI * 2,
                rot: Math.random() * Math.PI * 2,
                vr: (Math.random() - 0.5) * 0.04,
                flip: Math.random() * Math.PI * 2,
                vf: 0.03 + Math.random() * 0.05,
                c1: c[0], c2: c[1],
                alpha: 0.85 + Math.random() * 0.15
            });
        },

        drawPetal(p) {
            const ctx = this.ctx;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.scale(1, Math.max(0.18, Math.abs(Math.cos(p.flip)))); // giro en 3D
            const g = ctx.createLinearGradient(0, -p.s, 0, p.s);
            g.addColorStop(0, p.c1);
            g.addColorStop(1, p.c2);
            ctx.fillStyle = g;
            ctx.globalAlpha = p.alpha;
            ctx.beginPath();
            ctx.moveTo(0, p.s);
            ctx.bezierCurveTo(p.s * 0.95, p.s * 0.35, p.s * 0.7, -p.s * 0.9, 0, -p.s * 0.55);
            ctx.bezierCurveTo(-p.s * 0.7, -p.s * 0.9, -p.s * 0.95, p.s * 0.35, 0, p.s);
            ctx.fill();
            ctx.restore();
        },

        frame(t) {
            const ctx = this.ctx;
            ctx.clearRect(0, 0, this.w, this.h);
            const elapsed = t - this.start;

            // Pétalos nuevos durante ~6 s
            if (elapsed < 7000 && t - this.lastSpawn > (this.w < 768 ? 220 : 140)) {
                this.addPetal(false);
                this.lastSpawn = t;
            } else if (elapsed >= 7000) {
                this.petalBudget = 0;
            }

            // Chispas
            ctx.globalCompositeOperation = 'lighter';
            for (let i = this.sparks.length - 1; i >= 0; i--) {
                const s = this.sparks[i];
                s.life++;
                s.vx *= 0.955; s.vy = s.vy * 0.955 + 0.035;
                s.x += s.vx; s.y += s.vy;
                const k = 1 - s.life / s.max;
                if (k <= 0) { this.sparks.splice(i, 1); continue; }
                const tw = 0.6 + 0.4 * Math.sin(s.tw + s.life * 0.3);
                const rad = s.r * 4;
                const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, rad);
                g.addColorStop(0, `rgba(255,248,225,${0.95 * k * tw})`);
                g.addColorStop(0.35, `rgba(246,214,140,${0.6 * k * tw})`);
                g.addColorStop(1, 'rgba(240,190,120,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(s.x, s.y, rad, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalCompositeOperation = 'source-over';

            // Pétalos
            for (let i = this.petals.length - 1; i >= 0; i--) {
                const p = this.petals[i];
                p.phase += 0.02;
                p.y += p.vy;
                p.x += Math.sin(p.phase) * p.sway;
                p.rot += p.vr;
                p.flip += p.vf;
                if (p.y > this.h + 40) { this.petals.splice(i, 1); continue; }
                this.drawPetal(p);
            }
        }
    };

    window.XVIntro = { start: onTap, finish, canPlay };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
