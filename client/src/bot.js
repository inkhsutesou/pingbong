/*import Connection, {createLoginPacket, OP_ACK} from "./network";

export class Bot {
    constructor(connection) {
        this._connection = connection;
    }

    destruct() {
        self._connection.close();
    }
}

export default function createBot(cb) {
    const connection = new Connection(() => {
        const buffer = createLoginPacket("test"); // XXX
        connection.addTempHandler(OP_ACK, )

        cb(new Bot(connection));
    });
}
*/