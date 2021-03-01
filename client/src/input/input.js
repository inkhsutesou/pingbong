export class Input {
    /**
     * Constructor for Input
     */
    constructor() {
        this.w = 0;
        this.h = 0;
        this.angle = 0;
    }

    /**
     * Update width and height of interaction area.
     * @param {number} w width
     * @param {number} h height
     */
    setWH(w, h) {
        this.w = w / 2;
        this.h = h / 2;
    }

    /**
     * Sets the direction of the player by pointer pos.
     * @param {number} mousePosX 
     * @param {number} mousePosY 
     */
    setPointerPos(mousePosX, mousePosY) {
        mousePosX -= this.w;
        mousePosY -= this.h;
        this.setAngle(mousePosX, mousePosY);
    }

    /**
     * Sets the direction of the player directly to an angle.
     * @param {number} x
     * @param {number} y
     */
    setAngle(x, y) {
        this.angle = Math.atan2(y, x);
        //if(this.angle < 0) this.angle += Math.PI * 2;
    }
}

export function fixInputProblems() {
    window.addEventListener('keydown', e => {
        switch(e.key) {
            case 'Backspace': {
                if(e.target.tagName !== 'INPUT')
                    e.preventDefault();
                break;
            }

            case 'Tab': {
                e.preventDefault();
                break;
            }
        }
    }, false);
}
