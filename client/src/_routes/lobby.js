import { useEffect, useState } from "preact/hooks";
import { getConnection } from "..";
import { enterRoom } from "./room";
import { OP_SEND_LISTROOMS, OP_RECV_LISTROOMS, OP_SEND_CREATEROOM, OP_RECV_CREATEDROOM, OP_RECV_ROOMERROR } from "../network";
import Loading from "../components/loading";
import Error from '../components/error';
import Icon from '../components/icon';
import Button from "../components/button";
import {matchTimeStrFromNr} from "../util";
import {cleanString} from "../stringcleaner";
import {getPing, updateSRTT} from "../components/app";
import {HIGH_PING_THRESHOLD} from "../config";
import AchievementPage from "../components/achievementpage";
import { isBrowserProblematicForFilters } from "../post-processing/filtertracker";
import Trailer from "../components/trailer";

let _errorMsg;

/**
 * @param {string} msg 
 */
export function setLobbyError(msg) {
    _errorMsg = msg;
}

const BallDiv = (props) => {
    return (
        <div {...props} className={`w-3 h-3 bg-white rounded-full inline-block ${props.className || ''}`} />
    );
};

// XXX: shitty but whatever...
let start = 0;

const Lobby = (props) => {
    const [rooms, setRooms] = useState(undefined);
    const [playingCount, setPlayingCount] = useState(undefined);
    const [errorMsg, setErrorMsg] = useState(_errorMsg);
    const [pingString, setPingString] = useState(getPing());
    const [showAchievements, setShowAchievements] = useState(false);
    _errorMsg = undefined;

    // Start time of refresh request.

    const refreshRooms = () => {
        start = Date.now();
        getConnection().sendByte(OP_SEND_LISTROOMS);
    };

    useEffect(() => {
        getConnection().addHandler(OP_RECV_LISTROOMS, (view) => {
            updateSRTT(Date.now() - start);
            setPingString(getPing());
            setPlayingCount(view.getVarInt());
            const len = view.getVarInt();
            const result = [];
            for(let i = 0; i < len; ++i) {
                const roomId = view.getString();
                const name = cleanString(view.getString());
                const nrTeams = view.getUint8();
                const nrBalls = view.getUint8();
                const spinTowardsCenter = !!view.getUint8();
                const allowPowerUps = !!view.getUint8();
                const matchTime = matchTimeStrFromNr(view.getUint8());
                const playerCount = view.getVarInt();
                result.push({
                    roomId,
                    name,
                    nrTeams,
                    nrBalls,
                    spinTowardsCenter,
                    allowPowerUps,
                    matchTime,
                    playerCount,
                });
            }
            setRooms(result);
        });

        getConnection().addHandler(OP_RECV_CREATEDROOM, (view) => {
            const roomId = view.getString();
            enterRoom(roomId, false);
        });

        getConnection().addHandler(OP_RECV_ROOMERROR, (_view) => {
            setErrorMsg('Maximum number of rooms per session exceeded.');
        });

        refreshRooms();

        // Auto-refresh interval
        const refreshInterval = setInterval(refreshRooms, 1000);

        return () => {
            clearInterval(refreshInterval);
            getConnection().removeHandler(OP_RECV_LISTROOMS);
            getConnection().removeHandler(OP_RECV_CREATEDROOM);
            getConnection().removeHandler(OP_RECV_ROOMERROR);
        }
    }, []);

    return (
        <>
            <div className="flex justify-between">
                <div className="flex">
                    <Button color="blue" className="mr-2" onClick={_e => {
                        setErrorMsg(undefined);
                        refreshRooms();
                    }}><Icon name="refresh" className="btn-icon" /><span className="hidden sm:inline">Refresh list</span></Button>
                    <Button color="green" onClick={_e => {
                        getConnection().sendByte(OP_SEND_CREATEROOM);
                    }}><Icon name="plus-circle" className="btn-icon" /><span className="hidden sm:inline">Create room</span></Button>
                </div>
                <div className="flex">
                    <Button color="blue" className="mr-2" onClick={_e => setShowAchievements(true)}>
                        <Icon name="trophy" className="btn-icon" />
                        <span className="hidden sm:inline">Achievements</span>
                    </Button>
                    {showAchievements && (<AchievementPage onClose={() => setShowAchievements(false)} />)}
                    <Button color="red" onClick={_e => props.onLogout()}><Icon name="sign-out" /><span className="hidden sm:inline">Change name</span></Button>
                </div>
            </div>
            {rooms ? (
                <>
                    <div className="mt-2 flex flex-row justify-between">
                        <p className="text-sm">{playingCount} currently playing</p>
                        <p
                            title={pingString > HIGH_PING_THRESHOLD ? 'Your ping seems to be quite high, this may cause degraded gameplay.' : ''}
                            className={`text-sm ${pingString > HIGH_PING_THRESHOLD ? 'text-red-400' : 'text-gray-400'}`}
                        >Ping: {pingString} ms</p>
                    </div>
                    {errorMsg && (<Error text={errorMsg} />)}
                    {isBrowserProblematicForFilters() && (<Error text="Your browser has issues with filtering effects on your system. Please consider using an alternative browser such as Chrome, Edge, Safari, ..." />)}
                    {rooms.length > 0 ? (
                    <table className="mt-5 border-separate table-auto w-full rounded-md bg-gray-800 shadow-sm text-xs md:text-base">
                        <thead className="uppercase text-left">
                            <tr>
                                <th className="p-3 md:p-4">Name</th>
                                <th className="p-3 md:p-4"><Icon tooltip="Power-ups" className="text-2xl" name="angle-double-up" /><Icon tooltip="Gravity" className="text-2xl" name="bullseye" /><BallDiv title="Amount of balls" /></th>
                                <th className="p-3 md:p-4">Time</th>
                                <th className="p-3 md:p-4">Players</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody className="bg-gray-900">
                            {rooms.map(r => (
                                <tr key={r.roomId} className="border-t border-gray-800">
                                    <td className="p-3 md:p-4 break-all">{r.name}</td>
                                    <td className="p-3 md:p-4">
                                        <Icon
                                            className={`text-xl ${r.allowPowerUps ? 'text-green-400' : 'text-red-400'}`}
                                            tooltip={r.allowPowerUps ? 'Power-ups enabled' : 'Power-ups disabled'}
                                            name='angle-double-up'
                                        />
                                        <Icon
                                            className={`text-xl ${r.spinTowardsCenter ? 'text-green-400' : 'text-red-400'}`}
                                            tooltip={r.spinTowardsCenter ? 'Gravity towards center' : 'No additional gravity'}
                                            name='bullseye'
                                        />
                                        <div className="inline-block" title={`${r.nrBalls} balls`}>
                                            <BallDiv className="mr-1" />
                                            <span>{r.nrBalls}</span>
                                        </div>
                                    </td>
                                    <td className="p-3 md:p-4">{r.matchTime}</td>
                                    <td className="p-3 md:p-4">{r.playerCount}</td>
                                    <td>
                                        <Button color="green" onClick={_e => {
                                            enterRoom(r.roomId, true);
                                        }}>Join</Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    )
                    :
                    (<div className="mt-8 text-center">
                        No waiting rooms yet.<br />Invite some friends or create a room with bots!
                        <br />
                        <Button className="mt-5" color="green" onClick={_e => {
                            getConnection().sendByte(OP_SEND_CREATEROOM);
                        }}><Icon name="plus-circle" className="btn-icon" /><span className="hidden sm:inline">Create room</span></Button>
                        <div className="mt-8">
                            <p className="mb-2 text-sm text-gray-400">Or watch some gameplay</p>
                            <Trailer />
                        </div>
                    </div>)}
                </>
            ) : (<Loading />)}
        </>
    );
};

export default Lobby;
