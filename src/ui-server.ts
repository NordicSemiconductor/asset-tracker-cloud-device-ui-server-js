import * as http from 'http'
import { portForDevice } from './portForDevice'
import { server as WebSocketServer } from 'websocket'

export type WebSocketConnection = {
	send: (data: string) => void
}

const handleIncoming =
	(onMessage: (message: string, topic: string) => void) =>
	(
		request: http.IncomingMessage,
		response: http.ServerResponse,
		topic: string,
	) => {
		let body = ''
		request.on('data', (chunk) => {
			body += chunk.toString() // convert Buffer to string
		})
		request.on('end', () => {
			onMessage(body, topic)
			response.writeHead(202, {
				'Access-Control-Allow-Origin': '*',
			})
			response.end()
		})
	}

const handleIncomingJSONMessage =
	(onMessage: (message: Record<string, any>, topic: string) => void) =>
	(
		request: http.IncomingMessage,
		response: http.ServerResponse,
		topic: string,
	) => {
		let body = ''
		request.on('data', (chunk) => {
			body += chunk.toString() // convert Buffer to string
		})
		request.on('end', () => {
			try {
				const update = JSON.parse(body)
				onMessage(update, topic)
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
	onSensorMessage,
	onBatch,
	onWsConnection,
	onMessage,
}: {
	deviceId: string
	onUpdate: (update: Record<string, any>) => void
	onSensorMessage: (message: Record<string, any>) => void
	onMessage?: Record<string, (message: string, topic: string) => void>
	onBatch: (updates: Record<string, any>) => void
	onWsConnection: (connection: WebSocketConnection) => void
}): Promise<number> => {
	const port = portForDevice({ deviceId: deviceId })

	const updateHandler = handleIncomingJSONMessage(onUpdate)
	const sensorMessageHandler = handleIncomingJSONMessage(onSensorMessage)
	const batchHandler = handleIncomingJSONMessage(onBatch)

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
				updateHandler(request, response, request.url)
				break
			case '/message':
				sensorMessageHandler(request, response, request.url)
				break
			case '/batch':
				batchHandler(request, response, request.url)
				break
			case '/subscribe':
				// FIXME: Add websockets
				break
			default:
				if (onMessage?.[request.url ?? '/'] !== undefined) {
					handleIncoming(onMessage[request.url ?? '/'])(
						request,
						response,
						request.url ?? '/',
					)
				} else {
					response.statusCode = 404
					response.end()
				}
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
