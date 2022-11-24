import liveServer from "live-server"

const LOG_ALL = 2

liveServer.start({
    port: 5500,
    logLevel: LOG_ALL,
    middleware: [
        (req, res, next) => {
            res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
		    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
            next()
        }
    ]
})