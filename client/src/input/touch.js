export default class TouchInputProvider {
    /**
     * Constructor for TouchInputProvider
     * @param {Input} input The input
     */
    constructor(input) {
        this._input = input;
        this._currentIdentifier = -1;
        this._touchStart = this._touchStart.bind(this);
        this._touchEnd = this._touchEnd.bind(this);
        this._touchMove = this._touchMove.bind(this);
        const opts = {passive: false};
        document.addEventListener('touchstart', this._touchStart, opts);
        document.addEventListener('touchend', this._touchEnd, opts);
        document.addEventListener('touchmove', this._touchMove, opts);
    }

    /**
     * Destructor
     */
    destructor() {
        document.removeEventListener('touchstart', this._touchStart);
        document.removeEventListener('touchend', this._touchEnd);
        document.removeEventListener('touchmove', this._touchMove);
    }

    /**
     * Set pointer pos
     * @param {TouchEvent} e
     * @param {Touch} touch 
     */
    _setPointerPos(e, touch) {
        //const rect = e.currentTarget.getBoundingClientRect();
        //this._input.setPointerPos(touch.clientX - rect.left, touch.clientY - rect.top);
        this._input.setPointerPos(touch.clientX, touch.clientY);
    }

    /**
     * Touch start
     * @param {TouchEvent} e 
     */
    _touchStart(e) {
        const touch = e.changedTouches[0];
        if(this._currentIdentifier < 0) {
            this._currentIdentifier = touch.identifier;
            this._setPointerPos(e, touch);
        }
    }

    /**
     * Touch End
     * @param {TouchEvent} e 
     */
    _touchEnd(e) {
        for(let i = 0; i < e.changedTouches.length; ++i) {
            const touch = e.changedTouches[i];
            if(this._currentIdentifier === touch.identifier) {
                this._currentIdentifier = -1;
                break;
            }
        }
    }

    /**
     * Touch Move
     * @param {TouchEvent} e 
     */
    _touchMove(e) {
        e.preventDefault();

        for(let i = 0; i < e.changedTouches.length; ++i) {
            const touch = e.changedTouches[i];
            if(this._currentIdentifier === touch.identifier) {
                this._setPointerPos(e, touch);
                break;
            }
        }
    }
}
