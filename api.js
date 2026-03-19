// https://betterstack.com/community/guides/scaling-nodejs/express-websockets/

import express from "express";
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import pool from './db.js';

const app = express();
const server = createServer(app);

const port = process.env.PORT || 3000;

app.use(express.static('public'));

app.get('/', (req, res) => {
  console.log("Sending data!");
  res.send(`<!DOCTYPE html>
        <html>
            <head>
                <title>Portfolio Project Test</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; }
                    #messages { border: 1px solid #ccc; height: 300px; 
                               overflow-y: scroll; padding: 10px; margin-bottom: 10px; }
                    #messageInput { width: 300px; padding: 5px; }
                    button { padding: 5px 10px; }
                </style>
            </head>
            <body>
                <h1>Portfolio Project Test</h1>
                <div id="messages"></div>
                <input type="text" id="messageInput" placeholder="Enter your message">
                <button onclick="sendMessage()">Send Message</button>
                <script>
                    const ws = new WebSocket('ws://localhost:3000');
                    const messages = document.getElementById('messages');

                    ws.onmessage = function(event) {
                        const messageDiv = document.createElement('div');
                        messageDiv.textContent = event.data;
                        messages.appendChild(messageDiv);
                        messages.scrollTop = messages.scrollHeight;
                    };

                    function sendMessage() {
                        const input = document.getElementById('messageInput');
                        if (input.value) {
                            ws.send(input.value);
                            input.value = '';
                        }
                    }

                    document.getElementById('messageInput').addEventListener('keypress', function(e) {
                        if (e.key === 'Enter') {
                            sendMessage();
                        }
                    });
                </script>
            </body>
        </html>
  `);
});

const wss = new WebSocketServer({ server });
wss.on('connection', function connection(ws) {
    console.log('New client connected');

    ws.on('message', function message(data) {
        const messageText = data.toString();
        console.log('Received:', messageText);
        if (messageText == "finn,123") {
          ws.send("Authentication successful.");
        }
        ws.send(`Echo: ${messageText}`);
    });

    ws.on('close', function close() {
        console.log('Client disconnected');
    });
});

server.listen(port, () => {
  console.log(`Example server listening at http://localhost:${port}`);
});

const result = await pool.query('SELECT NOW()');
console.log(result.rows);