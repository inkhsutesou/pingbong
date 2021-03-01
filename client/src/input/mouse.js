export default class MouseInputProvider {
    /**
     * Constructor for MouseInputProvider
     * @param {Input} input The input
     */
    constructor(input) {
        this._input = input;
        this._mouseMove = this._mouseMove.bind(this);
        //this.blur = this.blur.bind(this);
        document.addEventListener('mousemove', this._mouseMove, false);
        //window.addEventListener('blur', this.blur, false);
    }

    /**
     * Destructor
     */
    destructor() {
        document.removeEventListener('mousemove', this._mouseMove, false);
        //window.removeEventListener('blur', this.blur, false);
    }

    /**
     * @param {MouseEvent} e 
     */
    _mouseMove(e) {
        this._input.setPointerPos(e.clientX, e.clientY);
    }
}
