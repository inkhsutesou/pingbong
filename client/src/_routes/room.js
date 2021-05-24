import { useEffect, useRef, useState } from "preact/hooks";
import { getConnection, getName } from "..";
import {
    OP_SEND_LEAVEROOM,
    OP_SEND_STARTROOM,
    OP_SEND_JOINROOM,
    OP_RECV_JOINEDROOM,
    OP_RECV_STARTROOM,
    OP_RECV_JOINROOM,
    OP_RECV_LEAVEROOM,
    OP_RECV_ROOMJOINERROR,
    OP_SEND_SETTINGS,
    OP_RECV_SETTINGS,
    OP_SEND_ADD_BOT, OP_SEND_REMOVE_BOT
} from "../network";
import { FIELD_WIDTH, FIELD_HEIGHT, CANVAS_PADDING, TEAM_COLORS } from "../config";
import PlayState from '../playstate';
import { Input } from '../input/input';
import MouseInputProvider from '../input/mouse';
import TouchInputProvider from '../input/touch';
import {createBall} from "../ball";
import Loading from "../components/loading";
import { setLobbyError } from "./lobby";
import Icon from "../components/icon";
import Button from "../components/button";
import Switch from "../components/switch";
import {clamp, fixedRoute, matchTimeStrFromNr} from "../util";
import {cleanString} from "../stringcleaner";
import GamepadInputProvider from "../input/gamepad";

const MIN_BALLS = 1;
const MAX_BALLS = 8;

let _requireToSendJoin = true;

function ScoreThing(props) {
    const {teamNr, prefix} = props;
    return (
        <div className="rounded-lg score shadow-sm" style={{background: TEAM_COLORS[teamNr]}} id={`${prefix}${teamNr}`}>
            {props.children}
        </div>
    );
}

const GameCanvas = (props) => {
    const ref = useRef(null);
    const [finalScores, setFinalScores] = useState(undefined);

    useEffect(() => {
        const canvas = ref.current;

        const input = new Input();
		const mouse = new MouseInputProvider(input);
        const touch = new TouchInputProvider(input);
        const gamepad = new GamepadInputProvider(input);

        let ws = 1, hs = 1, s = 1;

        const rootStyle = document.documentElement.style;

        const resizeHandler = _e => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            const ratio = Math.min(w / props.width, h / props.height);
            const dpr = window.devicePixelRatio || 1;

            const elemRatio = Math.min(1, ratio);
            rootStyle.setProperty('--scale', elemRatio);

            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            canvas.width = Math.floor(w * dpr * ws);
            canvas.height = Math.floor(h * dpr * hs);
            input.setWH(w, h);
            playState.scale = ratio * dpr / s;
        };

        const playStateResizeHandler = (newWs, newHs, newS) => {
            ws = newWs;
            hs = newHs;
            s = newS;
            resizeHandler(null);
        };

        const playState = new PlayState(canvas, input, props.myPlayerId, props.players, props.startState, props.resetHandler, setFinalScores, playStateResizeHandler);

        resizeHandler(null);
        window.addEventListener('resize', resizeHandler, false);

        return () => {
            console.log('destruct current game canvas & play state');
            window.removeEventListener('resize', resizeHandler);
            playState.destructor();
            mouse.destructor();
            touch.destructor();
            gamepad.destructor();
        };
    // Note: empty dependency array because this may only execute once!
    }, []); // eslint-disable-line

    return (
        <>
            <div className="top">
                <div id="timers" className="hud-tr">
                    <div className="bg-gray-800 rounded-md shadow-sm" id="timer" />
                    <div id="meter" className="rounded-md">
                        <div id="meter-inner" />
                    </div>
                </div>
                <div id="tlgroup" className="hud-tl flex flex-col items-start">
                    {!finalScores && (<div id="scorecontainer">
                        {[...Array(props.startState.teamCount)].map((_, i) => (
                            <ScoreThing teamNr={i} key={i} prefix="score-team" />
                        ))}
                    </div>)}
                    <div>
                        <ul id="players" className="hud-tl bg-gray-800 px-4 py-2 rounded-md shadow-sm" />
                    </div>
                </div>
            </div>
            <div id="matchover" className="rounded-md flex flex-col items-center p-6 shadow-lg">
                <h2 className="text-3xl mb-2">Match over!</h2>
                {finalScores && (<div id="finalcontainer">
                    <ol>
                        {finalScores.map(item => (
                            <li key={item.teamNr}>
                                <ScoreThing teamNr={item.teamNr} prefix="final-score-team">
                                    {item.score}
                                </ScoreThing>
                            </li>
                        ))}
                    </ol>
                </div>)}
                <em className="mt-2" id="matchover-countdown" />
            </div>
            <canvas ref={ref} width={props.width} height={props.height} />
            <svg className="defs-only">
                <filter id="filter-split" x="0" y="0" width="100%" height="100%">
                    <feOffset id="off1" result="rOff" in="SourceGraphic" dx="0" dy="0" />
                    <feColorMatrix in="rOff" result="rOff" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" />
                    <feOffset id="off2" result="gOff" in="SourceGraphic" dx="0" dy="0" />
                    <feOffset id="off3" in="SourceGraphic" result="bOff" dx="0" dy="0" />
                    <feColorMatrix in="gOff" result="gOff" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" />
                    <feColorMatrix in="bOff" result="bOff" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" />
                    <feComposite in="rOff" in2="gOff" operator="arithmetic" k2="1" k3="1" result="tmp2" />
                    <feComposite in="tmp2" in2="bOff" operator="arithmetic" k2="1" k3="1" />
                </filter>
            </svg>
        </>
    );
};

const Room = (props) => {
    const [clientId, setClientId] = useState(0);
    const [players, setPlayers] = useState([]);
    const [isLoading, setIsLoading] = useState(_requireToSendJoin);
    const [hostId, setHostId] = useState(0);
    const [startState, setStartState] = useState(undefined);
    const [balls, _setBalls] = useState(2);
    const [powerUps, setPowerUps] = useState(true);
    const [spinTowardsCenter, setSpinTowardsCenter] = useState(false);
    const [matchTime, setMatchTime] = useState(0);
    const [joinUrlLabel, setJoinUrlLabel] = useState('Copy join URL');

    const sendSettings = () => {
        if(isLoading || hostId !== clientId)
            return;
        const buffer = new DataView(new ArrayBuffer(5));
        buffer.setUint8(0, OP_SEND_SETTINGS);
        buffer.setUint8(1, balls);
        buffer.setUint8(2, +powerUps);
        buffer.setUint8(3, matchTime);
        buffer.setUint8(4, +spinTowardsCenter);
        getConnection().send(buffer);
    };

    // eslint-disable-next-line
    useEffect(sendSettings, [balls, powerUps, matchTime, spinTowardsCenter]);

    const resetHandler = () => {
        setStartState(undefined);
    };

    const setBalls = b => {
        b = clamp(b, MIN_BALLS, MAX_BALLS);
        _setBalls(b);
    };

    const decodePlayer = (view) => {
        const otherClientId = view.getVarInt();
        const otherName = view.getString();
        return ({
            clientId: otherClientId,
            name: cleanString(otherName),
        });
    };

    const recvSettingsHandler = (view) => {
        _setBalls(view.getUint8());
        setPowerUps(!!view.getUint8());
        setMatchTime(view.getUint8());
        setSpinTowardsCenter(!!view.getUint8());
    };

    const joinRoomHandler = (view) => {
        console.log("join room handler");
        setPlayers(players => {
            const newPlayers = [...players];
            newPlayers.push(decodePlayer(view));
            return newPlayers;
        });
    };

    const leaveRoomHandler = (view) => {
        const leftClientId = view.getVarInt();
        setHostId(view.getVarInt());
        setPlayers(players => {
            return players.filter(p => p.clientId !== leftClientId);
        });
    };

    useEffect(() => {
        console.log('connect to', props.id);

        let shouldSendDisconnect = true;

        // Send room join if required.
        if(_requireToSendJoin) {
            getConnection().addTempHandler(OP_RECV_JOINEDROOM, (view) => {
                setClientId(view.getVarInt());
                setHostId(view.getVarInt());
                const len = view.getVarInt();
                const players = [];
                for(let i = 0; i < len; ++i) {
                    players.push(decodePlayer(view));
                }
                recvSettingsHandler(view);
                setPlayers(players);
                setIsLoading(false);
            });
            getConnection().addTempHandler(OP_RECV_ROOMJOINERROR, (_view) => {
                setLobbyError('That room does not exist or has already started.');
                shouldSendDisconnect = false;
                fixedRoute('/', true);
            });
            const encoder = new TextEncoder();
            const view = encoder.encode(props.id);
            const buffer = new Uint8Array(new ArrayBuffer(1 + 1 + view.length));
            buffer[0] = OP_SEND_JOINROOM;
            buffer[1] = view.length;
            buffer.set(view, 2);
            getConnection().send(buffer);
        } else {
            _requireToSendJoin = true;
        }

        getConnection().addHandler(OP_RECV_SETTINGS, recvSettingsHandler);
        getConnection().addHandler(OP_RECV_JOINROOM, joinRoomHandler);
        getConnection().addHandler(OP_RECV_LEAVEROOM, leaveRoomHandler);
        getConnection().addHandler(OP_RECV_STARTROOM, (view) => {
            const teamCount = view.getUint8();
            const spinTowardsCenter = !!view.getUint8();
            const matchTime = view.getFloat32();
            let len = view.getUint8();
            const states = {};
            for(let i = 0; i < len; ++i) {
                const clientId = view.getVarInt();
                const teamNr = view.getUint8();
                const pos = view.getFloat32();
                const wAngle = view.getFloat32();
                states[clientId] = {teamNr, pos, wAngle};
            }

            len = view.getUint8();
            const balls = [];
            for(let i = 0; i < len; ++i) {
                const x = view.getFloat32();
                const y = view.getFloat32();
                const dx = view.getFloat32();
                const dy = view.getFloat32();
                const spin = view.getFloat32();
                balls.push(createBall(x, y, dx, dy, spin, spinTowardsCenter));
            }

            setStartState({
                teamCount,
                matchTime,
                states,
                balls,
                spinTowardsCenter,
            });
        });

        return () => {
            console.log('disconnect from room');
            // Need to disconnect from the room.
            getConnection().removeHandler(OP_RECV_SETTINGS);
            getConnection().removeHandler(OP_RECV_JOINROOM);
            getConnection().removeHandler(OP_RECV_LEAVEROOM);
            getConnection().removeHandler(OP_RECV_STARTROOM);
            if(shouldSendDisconnect)
                getConnection().sendByte(OP_SEND_LEAVEROOM);
        };
    }, [props.id]); // eslint-disable-line

    if(isLoading) {
        return <Loading />;
    } else if(startState) {
        return (
            <GameCanvas
                width={FIELD_WIDTH + CANVAS_PADDING * 2}
                height={FIELD_HEIGHT + CANVAS_PADDING * 2}
                players={players}
                myPlayerId={clientId}
                startState={startState}
                resetHandler={resetHandler}
            />
        );
    } else {
        return (
            <>
                <div className="flex flex-row">
                    <Button color="red" className="mr-2" onClick={_e => {
                        fixedRoute('/');
                    }}><Icon name="chevron-left" /><span>Leave</span></Button>
                    <Button color="blue" onClick={_e => {
                        navigator.clipboard.writeText(location.href).catch(console.error);
                        const orig = joinUrlLabel;
                        setJoinUrlLabel('URL copied!');
                        setTimeout(() => {
                            setJoinUrlLabel(orig);
                        }, 2000);
                    }}><Icon name="copy" /><span id="copy-url-label">{joinUrlLabel}</span></Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 mt-5">
                    <div className="rounded-md bg-gray-900 p-6 shadow-sm flex flex-col justify-between">
                        <div>
                            <h2 className="text-3xl mb-4">Settings</h2>
                            <div className="flex items-center mb-2">
                                <label
                                    htmlFor="ball-input-number"
                                    className="text-gray-400 w-40 text-sm font-semibold"
                                >
                                    Amount of balls
                                </label>
                                {clientId === hostId ? (
                                    <div className="flex flex-row h-8 rounded-lg relative bg-transparent">
                                        <button
                                            className="transition-all bg-gray-800 text-white hover:bg-gray-700 h-full w-8 rounded-l cursor-pointer"
                                            onClick={_ => setBalls(balls - 1)}
                                        >
                                            <span className="text-1xl"><Icon name="minus" /></span>
                                        </button>
                                        <input
                                            type="number"
                                            className="transition-all text-center w-12 bg-gray-800 hover:bg-gray-700 focus:bg-gray-700 font-semibold flex items-center text-white"
                                            id="ball"
                                            min={MIN_BALLS}
                                            max={MAX_BALLS}
                                            onChange={e => setBalls(e.currentTarget.value)}
                                            value={balls}
                                        />
                                        <button
                                            className="transition-all bg-gray-800 text-white hover:bg-gray-700 h-full w-8 rounded-r cursor-pointer"
                                            onClick={_ => setBalls(balls + 1)}
                                        >
                                            <span className="text-1xl"><Icon name="plus" /></span>
                                        </button>
                                    </div>
                                ) : (
                                    <span className="text-white text-sm font-semibold">{balls}</span>
                                )}
                            </div>
                            <div className="flex items-center mb-2">
                                <label htmlFor="enable-powerups" className="text-gray-400 w-40 text-sm font-semibold">Power-ups</label>
                                <Switch id="enable-powerups" className="" disabled={clientId !== hostId} checked={powerUps} setChecked={setPowerUps} />
                            </div>
                            <div className="flex items-center mb-2">
                                <label htmlFor="enable-spin-towards-center" className="text-gray-400 w-40 text-sm font-semibold">Gravity towards center</label>
                                <Switch id="enable-spin-towards-center" className="" disabled={clientId !== hostId} checked={spinTowardsCenter} setChecked={setSpinTowardsCenter} />
                            </div>
                            <div className="flex items-center mb-2">
                                <label className="text-gray-400 w-40 text-sm font-semibold">Match duration</label>
                                <div className="flex flex-col">
                                    {hostId === clientId ? (
                                        <>
                                            {[0, 1].map(i => (
                                                <div key={i} className="inline-flex items-center">
                                                    <input
                                                        disabled={clientId !== hostId}
                                                        onchange={_e => setMatchTime(i)}
                                                        type="radio"
                                                        className="h-5 w-5 text-green-600 cursor-pointer"
                                                        checked={matchTime === i}
                                                    />
                                                    <span className="ml-2 text-white text-sm font-semibold">{matchTimeStrFromNr(i)}</span>
                                                </div>
                                            ))}
                                        </>
                                    ) : (
                                        <span className="text-white text-sm font-semibold">{matchTimeStrFromNr(matchTime)}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="mt-5">
                            {hostId === clientId ? (
                                <>
                                    {players.length < 1 ? (<p className="text-sm text-gray-400">You need at least one more player or bot.</p>) : <></>}
                                    <Button
                                        color="green"
                                        disabled={players.length < 1 /* doesn't include own player */}
                                        onClick={_e => {
                                            getConnection().sendByte(OP_SEND_STARTROOM);
                                        }}>
                                        <Icon name="check-circle" /><span>Start match</span>
                                    </Button>
                                </>
                            ) : (
                                <p>Waiting for {players.find(p => p.clientId === hostId).name} to start the match.</p>
                            )}
                        </div>
                    </div>
                    <div className="rounded-md bg-gray-900 p-6 shadow-sm flex flex-col justify-between">
                        <div>
                            <h2 className="text-3xl mb-2">Players</h2>
                            <ul className="list-disc list-inside break-words">
                                <li>{getName()} (you)</li>
                                {players.map(p => (
                                    <li key={p.clientId}>{p.name}</li>
                                ))}
                            </ul>
                        </div>
                        {hostId === clientId && (
                            <div className="mt-5">
                                <Button color="green" className="mr-2" onClick={_e => getConnection().sendByte(OP_SEND_ADD_BOT)}>
                                    <Icon name="plus-circle" className="btn-icon" /><span>Add bot</span>
                                </Button>
                                <Button color="red" onClick={_e => getConnection().sendByte(OP_SEND_REMOVE_BOT)}>
                                    <Icon name="minus-circle" className="btn-icon" /><span>Remove bot</span>
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </>
        );
    }
};

export function enterRoom(roomId, requireToSendJoin) {
    _requireToSendJoin = requireToSendJoin;
    fixedRoute(`/rooms/${roomId}`);
}

export default Room;
