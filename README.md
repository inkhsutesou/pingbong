# PingBong

Beware, this project was made in a hurry. Here be dragons.

Development lokaal runnen:
* De server binary zit in de dist folder. Er wordt geluisterd op port 4242.
* `npm start` in de client folder (eerste keer wel `npm i`).

Deployment public:
* De server luistert op port 4242, en served static content vanaf de dist/static folder. Dus de client public html en js files moeten daarin.
* `npm run build` maakt een distribution build.
* reverse proxy warning: Add deze setting: `proxy_read_timeout 1800s;`.
* htaccess eventueel voor de preact paths
