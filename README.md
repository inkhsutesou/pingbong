# PingBong

Beware, this project was made in a hurry. Here be dragons.

## Installing the dependencies

The project is structured with two folders: client and server.
The client is written in JS and uses npm as a package manager.
The server is Rust, and uses the nighly toolchain (unfortunately can't use stable mainly due to package dependencies).

```bash
cd client
npm i
cd ../server
cargo r -- 0.0.0.0:4242 # Will pull the dependencies and run with binding to all network interfaces on port 4242.
```

## Deployment public

You can use a reverse proxy such as nginx.
There's a .htaccess file for the client build.
`npm run build` will create a distribution buid.
