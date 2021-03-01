import 'tailwindcss/tailwind.css';
import './index.css';
import App from './components/app';

let connection, name;

/**
 * @param {Connection} c 
 */
export function setConnection(c) {
    connection = c;
}

/**
 * @return {Connection}
 */
export function getConnection() {
    return connection;
}

/**
 * @param {string} n 
 */
export function setName(n) {
    name = n;
}

/**
 * @return {string}
 */
export function getName() {
    return name;
}

export default App;
