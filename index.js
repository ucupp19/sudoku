const { WebSocket, WebSocketServer } = require("ws");
const http = require("http");
const uuidv4 = require("uuid").v4;

const server = http.createServer();
const wsServer = new WebSocketServer({ server });
const port = 8000;

const clients = {};

/**
 * Broadcast a message from one client to all other clients.
 */
function broadcastMessage(dataStr, clientId) {
  for (let otherId in clients) {
    let otherClient = clients[otherId];
    // if connected, and not the sending client
    if (otherId !== clientId && otherClient.readyState === WebSocket.OPEN) {
      otherClient.send(dataStr);
    }
  }
}

function handleClose(clientId) {
  console.log(`${clientId} disconnected`);
  delete clients[clientId];

  // notify other clients
  let leaveMessage = {
    userId: clientId,
    message: { type: "client-leave" },
  };
  broadcastMessage(JSON.stringify(leaveMessage), clientId);
}

function handleMessage(message, clientId) {
  var messageStr = message.toString();
  if (messageStr.length > 150) {
    messageStr = `${messageStr.slice(0, 150)}...(${messageStr.length})`;
  }
  console.log("message", messageStr);
  // forward to all other clients
  broadcastMessage(message.toString(), clientId);
}

wsServer.on("connection", (connection) => {
  // create a new id for this client
  const clientId = uuidv4();
  clients[clientId] = connection;
  console.log(`${clientId} connected`);

  connection.on("message", (message) => handleMessage(message, clientId));
  connection.on("close", () => handleClose(clientId));

  // send the client it's new id
  let clientIdMessage = {
    userId: clientId,
    message: { type: "client-id" },
  };
  connection.send(JSON.stringify(clientIdMessage));

  // notify others that this new client joined
  let joinMessage = {
    userId: clientId,
    message: { type: "client-join" },
  };
  broadcastMessage(JSON.stringify(joinMessage), clientId);
});

server.listen(port, () => {
  console.log(`WebSocket server is running on port ${port}`);
});
