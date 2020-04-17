import * as http from 'http'
import * as chalk from 'chalk'
import { portForDevice } from './portForDevice'
import { server as WebSocketServer } from 'websocket'

export type WebSocketConnection = {
	send: (data: string) => void
}

const handleIncoming = (onMessage: (message: object) => void) => (
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

export const uiServer = async ({
	deviceId,
	deviceUiUrl,
	onUpdate,
	onMessage,
	onWsConnection,
}: {
	deviceId: string
	deviceUiUrl: string
	onUpdate: (update: object) => void
	onMessage: (message: object) => void
	onWsConnection: (connection: WebSocketConnection) => void
}) => {
	const port = portForDevice({ deviceId: deviceId })

	const updateHandler = handleIncoming(onUpdate)
	const messageHandler = handleIncoming(onMessage)

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
			case '/subscribe':
				// FIXME: Add websockets
				break
			default:
				response.statusCode = 404
				response.end()
		}
	}

	const server = http.createServer(requestHandler)

	server.listen(port, () => {
		console.log(
			chalk.cyan(`To control this device open your browser on:`),
			chalk.green(
				`${deviceUiUrl}?endpoint=${encodeURIComponent(
					`http://localhost:${port}`,
				)}`,
			),
		)
	})

	const wsServer = new WebSocketServer({
		httpServer: server,
	})
	wsServer.on('request', (request) => {
		const connection = request.accept(undefined, request.origin)
		onWsConnection(connection)
	})
}
