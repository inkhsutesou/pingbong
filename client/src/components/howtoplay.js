import createPowerUp, {POWERUP_LINE_WIDTH, POWERUP_SIZE} from "../powerup";
import {useState} from "preact/hooks";
import Modal from "./modal";

function AnnotatedImg(props) {
    return <img src={props.src} alt={props.title} title={props.title} />;
}

export default function HowToPlay(props) {
    const POWERUP_INFOS = [
        { title: 'Increase own team\'s paddle size', },
        { title: 'Gives 10 bonus points for your own team', },
        { title: 'Glitch the other teams\' screen', },
        { title: 'Rotate the other teams\' screen', },
        { title: 'Slow other teams down', },
    ];

    const [images] = useState(() => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = (POWERUP_SIZE + POWERUP_LINE_WIDTH) * 2;
        const ctx = canvas.getContext('2d');

        const array = [];
        for(let i = 0; i < POWERUP_INFOS.length; ++i) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            createPowerUp(POWERUP_SIZE + POWERUP_LINE_WIDTH, POWERUP_SIZE + POWERUP_LINE_WIDTH, i).tick(ctx, 0);
            array.push(canvas.toDataURL('image/png'));
        }

        return array;
    });

    return (
        <Modal onClose={props.onClose}>
            <h3 className="text-3xl text-center">
                How to play
            </h3>
            <div className="mt-3">
                <h2 className="text-2xl mb-2">Controls</h2>
                <p>
                    Use your mouse or touch screen to move your paddle. You can aim the ball(s) with your paddle.
                    The longer your team's rally, the more points you'll score (for up to 5 points).
                    You can play with as many people as you like.
                    <br /><br />
                    You can also use your gamepad to play.
                    Hold the left analog stick in the position where you want your paddle.
                </p>
                <h2 className="text-2xl mt-5 mb-2">Power-up list</h2>
                <div className="grid gap-4 grid-cols-2">
                    {POWERUP_INFOS.map((value, index) => (
                        <div className="flex items-center">
                            <AnnotatedImg src={images[index]} title={value.title} />
                            <p className="ml-2">{value.title}</p>
                        </div>
                    ))}
                </div>
            </div>
        </Modal>
    );
}
