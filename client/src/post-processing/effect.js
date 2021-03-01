export default class Effect {
    /**
     * @returns {WebGLRenderingContext}
     */
    static prepare() {
        const canvas = document.createElement('canvas');
        // Aight, here we go... Safari being a royal clusterfuck again and not really supporting webgl2
        const opts = {premultipliedAlpha: false, antialias: false, depth: false, stencil: false};
        let gl;
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        if(!isSafari) {
            gl = canvas.getContext('webgl2', opts);
        }
        if(!gl) {
            gl = canvas.getContext('webgl', opts);
        }
        if(!gl) {
            throw new Error("no WebGL context could be created");
        }
        return gl;
    }

    /**
     * Creates a new post-processing effect.
     * @param {WebGLRenderingContext} gl
     * @param {HTMLCanvasElement} source
     * @param {Shader} shader
     */
    constructor(gl, source, shader) {
        this._textureSource = source;
        this._canvas = gl.canvas;
        this._canvas.width = source.width;
        this._canvas.height = source.height;
        this._gl = gl;
        this._shader = shader;
        this._quad = this._createQuad();
        this._texture = this._createTexture();
        this._shader.activate();
        this._gl.enableVertexAttribArray(this._shader.position);
        this._gl.vertexAttribPointer(this._shader.position, 2, this._gl.FLOAT, false, 0, 0);
    }

    /**
     * Dispose
     */
    dispose() {
        this._gl.deleteTexture(this._texture);
        this._gl.deleteBuffer(this._quad);
    }

    /**
     * @returns {Shader}
     */
    get shader() {
        return this._shader;
    }

    /**
     * @returns {HTMLCanvasElement}
     */
    get domElement() {
        return this._canvas;
    }

    _createTexture() {
        const tex = this._gl.createTexture();
        this._gl.bindTexture(this._gl.TEXTURE_2D, tex);
        this._gl.texParameteri(this._gl.TEXTURE_2D, this._gl.TEXTURE_WRAP_S, this._gl.MIRRORED_REPEAT);
        this._gl.texParameteri(this._gl.TEXTURE_2D, this._gl.TEXTURE_WRAP_T, this._gl.MIRRORED_REPEAT);
        this._gl.texParameteri(this._gl.TEXTURE_2D, this._gl.TEXTURE_MIN_FILTER, this._gl.LINEAR);
        this._gl.texParameteri(this._gl.TEXTURE_2D, this._gl.TEXTURE_MAG_FILTER, this._gl.LINEAR);
        //this._gl.pixelStorei(this._gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        //this._gl.texImage2D(this._gl.TEXTURE_2D, 0, this._gl.RGBA, this._gl.RGBA, this._gl.UNSIGNED_BYTE, this._textureSource);
        //this._gl.bindTexture(this._gl.TEXTURE_2D, null);
        return tex;
    }

    _createQuad() {
        const verts = new Float32Array([
            1, 1,
            -1, 1,
            -1, -1,
            -1, -1,
            1, -1,
            1, 1,
        ]);
        const quad = this._gl.createBuffer();
        this._gl.bindBuffer(this._gl.ARRAY_BUFFER, quad);
        this._gl.bufferData(this._gl.ARRAY_BUFFER, verts, this._gl.STATIC_DRAW);
        //this._gl.bindBuffer(this._gl.ARRAY_BUFFER, null);
        return quad;
    }

    _updateTexture() {
        //this._gl.bindTexture(this._gl.TEXTURE_2D, this._texture);
        this._gl.texImage2D(this._gl.TEXTURE_2D, 0, this._gl.RGBA, this._gl.RGBA, this._gl.UNSIGNED_BYTE, this._textureSource);
    }

    _setAdditionalShaderData() {
        // You can override this in a subclass if you want to pass additional data to your shaders.
    }

    render() {
        //this._shader.activate();
        this._setAdditionalShaderData();
        this._gl.uniform2f(this._shader.canvasDimensions, this._canvas.width, this._canvas.height);
        this._gl.viewport(0, 0, this._canvas.width, this._canvas.height);
        //this._gl.clearColor(0, 0, 0, 1);
        //this._gl.clear(this._gl.COLOR_BUFFER_BIT);
        this._updateTexture();
        //this._gl.bindBuffer(this._gl.ARRAY_BUFFER, this._quad);
        //this._gl.enableVertexAttribArray(this._shader.position);
        //this._gl.vertexAttribPointer(this._shader.position, 2, this._gl.FLOAT, false, 0, 0);
        this._gl.drawArrays(this._gl.TRIANGLES, 0, 6);
    }
}
