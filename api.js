// https://betterstack.com/community/guides/scaling-nodejs/express-websockets/
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map - Maps
// https://www.w3schools.com/postgresql/index.php
// https://www.geeksforgeeks.org/node-js/password-encryption-in-node-js-using-bcryptjs-module/

import express from "express";
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import pool from './db.js';
import jwt from 'jsonwebtoken';
const bcrypt = require('bcryptjs');

const app = express();
const server = createServer(app);

const port = process.env.PORT || 3000;
const clients = new Map();

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
                <h1>Database Initialization</h1>
                <div id="messages"></div>
                <input type="text" id="messageInput" placeholder="Enter your message">
                <button onclick="sendMessage()">Send Message</button>
                <script>
                    const ws = new WebSocket('wss://messaging-server-e0oe.onrender.com');
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
    ws.authenticated = false;
    

    ws.on('message', function message(data) {
        let msg = JSON.parse(data);

        if (msg.type == "createAccount") {
            let user = msg.username;
            let pass = msg.password;
            let result = createAccount(user, pass);
            if (result) {
                ws.send(JSON.stringify({type: 'authenticationResult', content: 'Account Created Successfully.'}));
            } else {
                ws.send(JSON.stringify({type: 'authenticationResult', content: `Account Creation Failed: ${result}`}));
            }
            
        }

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
  console.log(`Server listening at http://localhost:${port}`);
});

async function createAccount(username, password) {
    let result = await pool.query(`SELECT EXISTS (SELECT 1 FROM users WHERE username = '${username}');`);
    if (result.rows[0].exists) {
        console.log("Username Taken!");
        return "Sorry, that username is not available.";
    } 

    hashedPass = hashString(password);
    hashedToken = hashString(generateToken(username));
    console.log(hashedPass);

    result = await pool.query("INSERT INTO users (username, hashedPassword, authToken) VALUES ($1, $2, $3)", [username, hashedPass, hashedToken]);

    if (result.rowCount == 1) {
        return true;
    } else {
        return false;
    }

};

function verifyCredentials() {

};

function sendMessage() {

};

function hashString(string) {
    let returnString;
    bcrypt.genSalt(10, function(err, Salt){
        bcrypt.hash(string, Salt, function(error, hash){
            if (err) {
                return -1;
            }

            return hash;
        })
    })
}

function compareHash(password, hashedPass) {
    bcrypt.compare(password, hashedPass, async function(err, match) {
        if (match) {
            return true;
        } else {
            return false;
        }
    })
}

function generateToken(user) {
    const payload = {username: user};
    const secret = process.env.JWT_SECRET;

    const token = jwt.sign(payload, secret);

    return token;
} 

//const result = await pool.query('SELECT NOW()');
//console.log(result.rows);

/*await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    hashedPassword TEXT NOT NULL,
    authToken TEXT UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS messages (
    messageID SERIAL PRIMARY KEY,
    sender TEXT NOT NULL,
    receiver TEXT NOT NULL,
    message TEXT,
    sentTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivered BOOLEAN DEFAULT FALSE
  );
`);

console.log("Database setup completed successfully."); */