import * as http from 'http'
import { portForDevice } from './portForDevice'
import { server as WebSocketServer } from 'websocket'

export type WebSocketConnection = {
	send: (data: string) => void
}

const handleIncoming = (onMessage: (message: Record<string, any>) => void) => (
	request: http.IncomingMessage,
	response: http.ServerResponse,
) => {
	let body = ''
	request.on('data', (chunk) => {
		body += chunk.toString() // convert Buffer to string
	})
	request.on('end', () => {
		try {
			const update = JSON.parse(body)
			onMessage(update)
			response.writeHead(202, {
				'Access-Control-Allow-Origin': '*',
			})
			response.end()
		} catch (err) {
			console.log(err)
			const errData = JSON.stringify(err)
			response.writeHead(400, {
				'Content-Length': Buffer.byteLength(errData),
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*',
			})
			response.end(errData)
		}
	})
}

/**
 * Starts the websocket server that receives commands from the web UI and forwards it to the handlers.
 *
 * Returns the port it is listening on.
 */
export const uiServer = async ({
	deviceId,
	onUpdate,
	onMessage,
	onBatch,
	onWsConnection,
}: {
	deviceId: string
	onUpdate: (update: Record<string, any>) => void
	onMessage: (message: Record<string, any>) => void
	onBatch: (updates: Record<string, any>) => void
	onWsConnection: (connection: WebSocketConnection) => void
}): Promise<number> => {
	const port = portForDevice({ deviceId: deviceId })

	const updateHandler = handleIncoming(onUpdate)
	const messageHandler = handleIncoming(onMessage)
	const batchHandler = handleIncoming(onBatch)

	const requestHandler: http.RequestListener = async (request, response) => {
		if (request.method === 'OPTIONS') {
			response.writeHead(200, {
				'Access-Control-Allow-Methods': 'GET,OPTIONS,POST',
				'Access-Control-Allow-Headers': 'Content-Type',
				'Access-Control-Allow-Origin': '*',
			})
			response.end()
			return
		}
		switch (request.url) {
			case '/id':
				response.writeHead(200, {
					'Content-Length': deviceId.length,
					'Content-Type': 'text/plain',
					'Access-Control-Allow-Origin': '*',
				})
				response.end(deviceId)
				break
			case '/update':
				updateHandler(request, response)
				break
			case '/message':
				messageHandler(request, response)
				break
			case '/batch':
				batchHandler(request, response)
				break
			case '/subscribe':
				// FIXME: Add websockets
				break
			default:
				response.statusCode = 404
				response.end()
		}
	}

	const server = http.createServer(requestHandler)

	const wsServer = new WebSocketServer({
		httpServer: server,
	})
	wsServer.on('request', (request) => {
		const connection = request.accept(undefined, request.origin)
		onWsConnection(connection)
	})

	return new Promise<number>((resolve) => {
		server.listen(port, () => {
			resolve(port)
		})
	})
}
