import {PROTOCOL_VERSION} from "./config";

export const OP_ACK = 0;

export const OP_RECV_JOINROOM = 1;
export const OP_RECV_LEAVEROOM = 2;
export const OP_RECV_CREATEDROOM = 4;
export const OP_RECV_JOINEDROOM = 5;
export const OP_RECV_LISTROOMS = 6;
export const OP_RECV_ROOMJOINERROR = 7;
export const OP_RECV_STARTROOM = 8;
export const OP_RECV_NAMEERROR = 9;
export const OP_RECV_ROOMERROR = 10;
export const OP_RECV_OUTDATED = 11;
export const OP_RECV_SETTINGS = 12;
export const OP_RECV_RESETROOM = 13;
export const OP_RECV_SYNC = 3;
export const OP_SEND_CREATEROOM = 0;
export const OP_SEND_JOINROOM = 1;
export const OP_SEND_LISTROOMS = 2;
export const OP_SEND_LEAVEROOM = 1;
export const OP_SEND_STARTROOM = 2;
export const OP_SEND_SETTINGS = 3;
export const OP_SEND_ADD_BOT = 4;
export const OP_SEND_REMOVE_BOT = 5;

export const TPS = 20;
export const TIME_DELAY = 1000 / TPS;
export const TPF = 60 / TPS;

export class PacketDecoder {
    /**
     * @param {DataView} view 
     */
    constructor(view) {
        this._view = view;
        this._off = 1;
    }

    /**
     * Reset offset.
     */
    reset() {
        this._off = 1;
    }

    /**
     * @return {number}
     */
    getUint8() {
        return this._view.getUint8(this._off++);
    }

    /**
     * @return {number}
     */
    getFloat32() {
        const read = this._view.getFloat32(this._off, true);
        this._off += 4;
        return read;
    }

    /**
     * Decodes varint coded number.
     * @return {number}
     */
    getVarInt() {
        const byte = this._view.getUint8(this._off);
        switch(byte) {
            case 251: {
                const read = this._view.getUint16(this._off + 1, true);
                this._off += 3;
                return read;
            }
            case 252: {
                const read = this._view.getUint32(this._off + 1, true);
                this._off += 5;
                return read;
            }
            default: {
                ++this._off;
                return byte;
            }
        }
    }

    /**
     * Decode string.
     * @return {string}
     */
    getString() {
        const decoder = new TextDecoder();
        const strLen = this.getVarInt();
        const str = decoder.decode(new Uint8Array(this._view.buffer, this._off, strLen));
        this._off += strLen;
        return str;
    }
}

export default class Connection {
    /**
     * Constructs a new connection.
     * @param {function(): void} cb Callback when connection is established
     */
    constructor(cb) {
        /** @const {Array<function(DataView): void>} */
        this._handlers = [];
        this._socket = new WebSocket(
            process.env.NODE_ENV === 'production' ?
                process.env.PREACT_APP_SERVER_PROD :
                process.env.PREACT_APP_SERVER_DEV
        );
        //this._socket = new WebSocket('ws://192.168.0.102:4242');
        //this._socket = new WebSocket('ws://' + location.host + '/ws/');
        this._socket.binaryType = 'arraybuffer';
        this._socket.onopen = (_e) => {
            cb();
        };
        this._socket.onmessage = this.onmessage.bind(this);
        this._socket.onclose = (e) => {
            setTimeout(() => {
                console.error(e);
                alert('Connection closed. Were you idle for too long or is the connection bad?');
                location.reload();
            }, 5000);
        };
        this._socket.onerror = (e) => {
            console.error('socket error', e);
        };
    }

    /**
     * Close socket.
     */
    close() {
        this._socket.onclose = void 0;
        this._socket.close();
    }

    /**
     * Sends a packet
     * @param {DataView|Uint8Array} packet The packet
     */
    send(packet) {
        //console.trace();
        this._socket.send(packet.buffer);
    }

    /**
     * Sends a single byte
     * @param {number} byte The byte to send
     */
    sendByte(byte) {
        this.send(new Uint8Array([byte]));
    }

    /**
     * Adds a handler
     * @param {number} opcode The opcode
     * @param {function(PacketDecoder): void} handler The handler function
     */
    addHandler(opcode, handler) {
        this._handlers[opcode] = handler;
    }

    /**
     * Replaces a handler
     * @param {number} opcode The opcode
     * @param {function(PacketDecoder): void} handler The handler function
     * @return {function(PacketDecoder): void}
     */
    replaceHandler(opcode, handler) {
        // Dirty but whatever...
        const old = this._handlers[opcode];
        this._handlers[opcode] = handler;
        return old;
    }

    /**
     * Removes a handler
     * @param {number} opcode The opcode
     */
    removeHandler(opcode) {
        this._handlers[opcode] = undefined;
    }

    /**
     * Adds a temporary handler: handler disappears when the callback is executed
     * @param {number} opcode The opcode
     * @param {function(PacketDecoder): void} handler The handler function
     */
    addTempHandler(opcode, handler) {
        this.addHandler(opcode, (view) => {
            this.removeHandler(opcode);
            handler(view);
        });
    }

    /**
     * On receive message
     * @param {MessageEvent} e The message event
     */
    onmessage(e) {
        const view = new DataView(e.data);
        const opcode = view.getUint8(0);
        const h = this._handlers[opcode];
        if(h) {
            h(new PacketDecoder(view));
        }
    }
}

/**
 * Creates the login packet
 * @param {string} name The name of the player
 * @returns {Uint8Array} The packet buffer
 */
export function createLoginPacket(name) {
    const encoder = new TextEncoder();
    const view = encoder.encode(name);
    const buffer = new Uint8Array(new ArrayBuffer(1 + 1 + 1 + view.length));
    buffer[0] = 0;
    buffer[1] = PROTOCOL_VERSION;
    buffer[2] = view.length;
    buffer.set(view, 3);
    return buffer;
}
