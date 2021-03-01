import {BACKGROUND_COLOR_B, BACKGROUND_COLOR_G, BACKGROUND_COLOR_R} from "./config";

const FRICTION = 0.92;
//const GRAVITY = 0.015;
const PARTICLE_SPAWN_COUNT = 30;

const W = 180;
const H = 180;

const FIREWORK_BACKGROUND_COLOR = `rgba(${BACKGROUND_COLOR_R},${BACKGROUND_COLOR_G},${BACKGROUND_COLOR_B},0.05)`;

class FireworkParticle {
    /**
     * Constructs a new firework particle
     * @param {number} hue 
     * @param {number} vx 
     * @param {number} vy 
     */
    constructor(hue, vx, vy) {
        this.x = W / 2;
        this.y = H / 2;
        this.vx = vx;
        this.vy = vy;
        this._coords = [];
        const hueVariation = Math.round((Math.random() - 0.5) * 7);
        const value = 50 + Math.round(Math.random() * 15);
        //const saturation = 90 + Math.round(Math.random() * 10);
        this.strokeStyle = `hsla(${hue + hueVariation}, 100%, ${value}%, 1)`;
        for(let i = 0; i < 2; ++i) {
            this._coords.push([this.x, this.y]);
        }
    }

    /**
     * Ticks
     * @param {CanvasRenderingContext2D} ctx
     */
    tick(ctx) {
        ctx.fillStyle = this.strokeStyle;
        ctx.beginPath();
        for(const c of this._coords) {
            ctx.arc(c[0], c[1], 1.5, 0, Math.PI * 2, false);
        }
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= FRICTION;
        this.vy *= FRICTION;
        //this.vy += GRAVITY; // Does not work with rotation
        this._coords.shift();
        this._coords.push([this.x, this.y]);
        ctx.fill();
    }
}

export default class Firework {
    /**
     * Constructs a new Firework explosion.
     * @param {number} hue The hue area of the firework particles.
     * @param {number} x 
     * @param {number} y 
     * @param {number} scale 
     */
    constructor(hue, x, y, scale) {
        this._canvas = document.createElement('canvas');
        this._canvas.width = W * scale;
        this._canvas.height = H * scale;
        this._ctx = this._canvas.getContext('2d');
        this._timer = 3;
        this._ctx.lineCap = 'round';
        this._ctx.scale(scale, scale);
        this._particles = Array(PARTICLE_SPAWN_COUNT);
        this.x = x - W / 2;
        this.y = y - H / 2;
        this._alpha = 1;

        for(let i = 0; i < PARTICLE_SPAWN_COUNT; ++i) {
            const angle = (i / PARTICLE_SPAWN_COUNT - 0.5) * Math.PI * 2; // Uniform distribution in a circle
            //const speed = 4.5 + Math.cos(Math.random() * Math.PI / 2) * 2;
            const speed = 6;
            this._particles[i] = new FireworkParticle(hue, Math.cos(angle) * speed, Math.sin(angle) * speed);
        }
    }

    /**
     * Destructor.
     */
    _destructor() {
        this._ctx = undefined;
        this._canvas = undefined;
        this._particles = undefined;
    }

    /**
     * Tick.
     * @param {CanvasRenderingContext2D} ctx 
     * @param {number} delta
     * @return {boolean}
     */
    tick(ctx, delta) {
        this._ctx.globalCompositeOperation = 'destination-out';
        this._ctx.fillStyle = FIREWORK_BACKGROUND_COLOR;
        this._ctx.fillRect(0, 0, W, H);

        if(this._timer < 2 && this._alpha > 0) {
            this._alpha -= 0.02 * delta;
        }

        if(this._timer > 0.5) {
            this._timer -= 0.025 * delta;
        }

        this._ctx.globalCompositeOperation = 'lighter';
        for(const particle of this._particles) {
            particle.tick(this._ctx);
        }

        //this.ctx.strokeStyle = 'blue';
        //this.ctx.strokeRect(0, 0, W, H);

        ctx.globalAlpha = Math.max(0, this._alpha);
        ctx.drawImage(this._canvas, this.x, this.y, W, H);
        ctx.globalAlpha = 1;

        if(this._alpha < 0.01) {
            this._destructor();
            return true;
        } else {
            return false;
        }
    }
}
