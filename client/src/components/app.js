import { Component } from 'preact';
import {Router} from 'preact-router';
import {useEffect, useState} from 'preact/hooks';
import { getConnection, setConnection, setName } from '../index';
import { initSoundSystem, SoundManager } from '../sound';
import {clamp, fixedRoute, initUtils} from '../util';
import { fixInputProblems } from '../input/input';
import Error from '../components/error';

import Lobby from '../_routes/lobby';
import Room from '../_routes/room';
import PrivacyPolicy from '../_routes/privacypolicy';
import Connection, {createLoginPacket, OP_ACK, OP_RECV_NAMEERROR, OP_RECV_OUTDATED} from '../network';
import Icon from './icon';
import Loading from './loading';
import Credits from './credits';
import Button from "./button";

import logo from '../assets/logo.png';
import HowToPlay from "./howtoplay";
import Changelog, {LATEST_VERSION} from "./changelog";
import {setAchievementSpawnCallback} from "../achievement";
import {AchievementPopup} from "./achievement";
import Trailer from "./trailer";

export let SOUND_MANAGER;
export let sRTT;

/**
 * Calculates the initial delay from sRTT.
 * @return {number}
 */
export function getInitialDelay() {
	//return clamp(sRTT - 5, 0, 150);
	return clamp(sRTT, 0, 200);
}

/**
 * Get ping.
 * @returns {number}
 */
export function getPing() {
	return Math.round(sRTT);
}

/**
 * Update sRTT.
 * @param {number} n new observed RTT
 */
export function updateSRTT(n) {
	if(sRTT) {
		const a = 1 / 8;
		sRTT = (1 - a) * sRTT + a * n;
	} else {
		sRTT = n;
	}
}

/**
 * @returns {boolean}
 */
function isBrowserBad() {
	return typeof window['TextEncoder'] === 'undefined';
}

/**
 * Gets the default stored name.
 * @returns {string}
 */
function getDefaultName() {
	return localStorage.getItem('name') || '';
}

/**
 * Sets a default name
 * @param {string} name
 */
function setDefaultName(name) {
	localStorage.setItem('name', name);
}

const HomePage = (props) => {
	const [myName, setMyName] = useState(getDefaultName());
	const [showCredits, setShowCredits] = useState(false);
	const [showHowToPlay, setShowHowToPlay] = useState(false);
	const [showChangelog, setShowChangelog] = useState(false);

	useEffect(() => {
		// Work-around for autofocus not working for some fucking reason.
		setTimeout(() => {
			const n = document.getElementById('name');
			if(n) n.focus();
		}, 2);
	}, []);

	if(props.isLoading)
		return (<Loading />);

	return (
		<>
			<div className="flex justify-center items-center flex-col">
				<img alt="PingBong" src={logo} />
				<span className="mt-5 text-sm text-gray-400">
					<em className="italic text-red-400">Warning:</em> game contains fast moving objects and flashing lights, proceed with caution.
				</span>
			</div>
			<div className="mt-8 flex justify-around">
				<form onSubmit={e => {
					e.preventDefault();
					props.executeLogin(myName);
				}}>
					<div className="flex-col max-w-sm align-center w-full">
						<div className="input-group">
							<input className="transition-all w-full border border-transparent mb-2 py-2 px-4 bg-gray-800 hover:bg-gray-700 focus:bg-gray-700 text-white placeholder-white-400 shadow-md rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-opacity-75" id="name" type="text" autofocus required maxLength="20" placeholder="Your name" value={myName} onChange={e => setMyName(e.target.value)} />
							<Button className="w-full" color="blue" type="submit"><Icon name="check-circle" /><span>Enter lobby</span></Button>
						</div>
						{props.error && (<Error text={props.error} />)}
					</div>
				</form>
			</div>
			<div className="mt-8">
				<Trailer />
			</div>
			<div class="mt-3 flex flex-row justify-center">
				<Button className="mr-2" color="gray" onClick={_e => setShowCredits(true)}><Icon name="book" /><span>Credits</span></Button>
				{showCredits && (<Credits onClose={() => setShowCredits(false)} />)}
				<Button className="mr-2" color="gray" onClick={_e => setShowHowToPlay(true)}><Icon name="question" /><span>How to play</span></Button>
				{showHowToPlay && (<HowToPlay onClose={() => setShowHowToPlay(false)} />)}
				<Button color="gray" onClick={_e => fixedRoute('/privacy-policy')}><Icon name="book" /><span>Privacy policy</span></Button>
			</div>
			<div className="mt-3 flex flex-row justify-center">
				<div className="text-center">
					<p>
						<a className="text-sm text-blue-400 cursor-pointer" onClick={_e => setShowChangelog(true)}>Game version: {LATEST_VERSION}</a>
					</p>
					{showChangelog && (<Changelog onClose={() => setShowChangelog(false)} />)}
					<p>
						<a className="text-sm text-blue-400 cursor-pointer" href="https://github.com/nielsdos/pingbong" target="_blank" rel="noopener noreferrer">Help to contribute at https://github.com/nielsdos/pingbong</a>
					</p>
				</div>
			</div>
		</>
	);
}

const LoginGuard = () => {
	const [isLoggedIn, setIsLoggedIn] = useState(false);
	const [error, setError] = useState('');
	const [isLoading, setIsLoading] = useState(false);

	const executeLogin = (name) => {
		setIsLoading(true);
		const buffer = createLoginPacket(name);
		const start = Date.now();
		getConnection().addTempHandler(OP_RECV_OUTDATED, (view) => {
			const reasons = [
				'Your client is outdated. Please refresh to load the new version.', // XXX: app message
				'The server update is pending. Please try again shortly.'
			];
			alert(reasons[view.getUint8()]);
			location.reload();
		});
		getConnection().addTempHandler(OP_ACK, (_view) => {
			setIsLoading(false);
			updateSRTT(Date.now() - start);
			setName(name);
			setDefaultName(name);
			getConnection().removeHandler(OP_RECV_NAMEERROR);
			getConnection().removeHandler(OP_RECV_OUTDATED);
			setIsLoggedIn(true);
		});
		getConnection().addTempHandler(OP_RECV_NAMEERROR, (_view) => {
			setError('Name is invalid, only alphanumeric characters and spaces are allowed.');
		});
		getConnection().send(buffer);
	};

	const onLogout = () => {
		setDefaultName('');
		getConnection().close();
		setIsLoggedIn(false);
		setIsLoading(true);
		setConnection(new Connection(() => setIsLoading(false)));
	};

	useEffect(() => {
		const name = getDefaultName();
		if(name) {
			executeLogin(name);
		}
	}, []);

	if(isLoggedIn) {
		if(isLoading)
			return (<Loading />);
		return (
			<>
				<Router>
					<Room path="/pingbong/rooms/:id" />
					<Lobby onLogout={onLogout} default />
					<PrivacyPolicy path="/pingbong/privacy-policy" />
				</Router>
			</>
		);
	} else {
		return (
			<Router>
				<PrivacyPolicy path="/pingbong/privacy-policy" />
				<HomePage
					error={error}
					isLoading={isLoading}
					executeLogin={executeLogin}
					default
				/>
			</Router>
		);
	}
};

class App extends Component {
	constructor() {
		super();
		this.state = {loading: true, achievement: void 0};
	}

	_achievementCallback(achievement) {
		this.setState({achievement});
		setTimeout(() => {
			this.setState({achievement: void 0});
		}, 5000);
	}

	componentDidMount() {
		if(!isBrowserBad()) {
			setConnection(new Connection(() => this.setState({loading: false})));
			setAchievementSpawnCallback(this._achievementCallback.bind(this));
		}
	}

	render(_props, state) {
		if(state.loading) {
			if(isBrowserBad()) {
				return <div id="app">You are using an ancient browser. Please use something modern such as a recent Chrome, Firefox, Safari or Chromium-Edge.</div>
			}
			return <Loading />;
		}

		return (
			<div id="app" class="mt-3 p-2 container mx-auto">
				<LoginGuard />
				{state.achievement && (
					<AchievementPopup name={state.achievement.name} />
				)}
			</div>
		);
	}
}

window.addEventListener('load', _e => {
	initUtils();
	initSoundSystem();
	fixInputProblems();
	SOUND_MANAGER = new SoundManager();
	document.addEventListener('contextmenu', e => e.preventDefault(), false);
});

export default App;
