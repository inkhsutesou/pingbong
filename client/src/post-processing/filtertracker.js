import splitVertexShader from './identity-vert.glsl';
import splitFragmentShader from './split-fragment.glsl';
import Effect from "./effect";
import Shader from "./shader";
import { browserHasVerySlowTextureUpload } from '../util';

let gl, splitShader;

function onLoad() {
    console.time('shader');
    try {
        gl = Effect.prepare();
        splitShader = new Shader(gl, splitVertexShader, splitFragmentShader);
    } catch(e) {
        console.error(e);
        gl = splitShader = undefined;
    }
    console.timeEnd('shader');
}

window.addEventListener('load', onLoad);

/**
 * @return {number}
 * @private
 */
function _rnd() {
    let rnd = (Math.random() - 0.5) * 4; // [-2,2]
    if(rnd < 0) rnd -= 1.25;
    else rnd += 1.25;
    return rnd;
}

class SplitEffect extends Effect {
    constructor(canvas, texScaling) {
        super(gl, canvas, splitShader);
        this._shader.time = this._shader.getUniformLocation('time');
        this._shader.amps = this._shader.getUniformLocation('amps');
        this._shader.texScaling = this._shader.getUniformLocation('texScaling');
        this._amplitudes = [_rnd(), _rnd(), _rnd()];
        this._texScaling = texScaling;
    }

    _setAdditionalShaderData() {
        this._shader._gl.uniform1f(this._shader.time, performance.now() * 0.001);
        this._shader._gl.uniform3fv(this._shader.amps, this._amplitudes);
        this._shader._gl.uniform2f(this._shader.texScaling, this._texScaling.w, this._texScaling.h);
    }
}

class FilterTracker {
    /**
     * Creates a new split effect
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        this._canvas = canvas;
    }

    /**
     * Dispose.
     */
    dispose() {}

    /**
     * Tick
     */
    tick() {}
}

class SvgFilterTracker extends FilterTracker {
    constructor(canvas) {
        super(canvas);
        this._amplitudes = [_rnd(), _rnd(), _rnd()];
        this._offs = [
            document.getElementById('off1'),
            document.getElementById('off2'),
            document.getElementById('off3'),
        ];
        canvas.style.filter = 'url(#filter-split)';
    }

    dispose() {
        this._canvas.style.filter = '';
    }

    /**
     * @param {number} x
     * @returns {number}
     * @private
     */
    _transform(x) {
        return (x*20)|0;
    }

    tick() {
        // Not a full emulation, but close enough.
        const time = performance.now() * 0.001;
        for(let i = 0; i < 3; ++i) {
            const amp = this._amplitudes[i];
            const off = this._offs[i];
            const dx = Math.cos(amp * time) + Math.sin(Math.PI * time);
            const dy = Math.sin(amp * time) + Math.cos(Math.PI * time);
            off.setAttribute('dx', this._transform(dx));
            off.setAttribute('dy', this._transform(dy));
        }
    }
}

class WebGLFilterTracker extends FilterTracker {
    constructor(canvas, resizeHandler) {
        super(canvas);
        this._resizeHandler = resizeHandler;
        this._texScaling = {w: 1, h: 1, s: 1};
        if(browserHasVerySlowTextureUpload()) {
            // Linux + Gecko, the lovely performance combination.
            const s = navigator.userAgent.indexOf("X11") > -1 ? 1.75 : 1;

            if(canvas.width * canvas.height > 1024 * 1024) {
                if(canvas.width >= canvas.height) {
                    const over = 1024*1024 / canvas.height;
                    this._texScaling = {w: Math.min(canvas.width / over, 2)*s, h: s, s};
                } else {
                    const over = 1024*1024 / canvas.width;
                    this._texScaling = {w: s, h: Math.min(canvas.height / over, 2)*s, s};
                }
                this._resizeHandler(1 / this._texScaling.w, 1 / this._texScaling.h, this._texScaling.s);
            }
        }
        this._effect = new SplitEffect(canvas, this._texScaling);
        canvas.style.display = 'none';
        document.body.appendChild(this._effect.domElement);
    }

    dispose() {
        this._effect.dispose();
        this._effect.domElement.remove();
        this._canvas.style.display = '';
        if(browserHasVerySlowTextureUpload()) {
            this._resizeHandler(1, 1, 1);
        }
    }

    tick() {
        const s1 = this._effect.domElement;
        const s2 = this._canvas;
        if(s1.width !== s2.width * this._texScaling.w) {
            s1.width = s2.width * this._texScaling.w;
        }
        if(s1.height !== s2.height * this._texScaling.h) {
            s1.height = s2.height * this._texScaling.h;
        }
        if(s1.style.width !== s2.style.width) {
            s1.style.width = s2.style.width;
        }
        if(s1.style.height !== s2.style.height) {
            s1.style.height = s2.style.height;
        }
        this._effect.render();
    }
}

/**
 * @return {boolean}
 */
export function isBrowserProblematicForFilters() {
    return !gl && browserHasVerySlowTextureUpload();
}

export default function createFilterTracker(canvas, resizeHandler) {
    if(gl) {
        return new WebGLFilterTracker(canvas, resizeHandler);
    } else {
        return new SvgFilterTracker(canvas);
    }
}
