// https://betterstack.com/community/guides/scaling-nodejs/express-websockets/
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map - Maps
// https://www.w3schools.com/postgresql/index.php
// https://www.geeksforgeeks.org/node-js/password-encryption-in-node-js-using-bcryptjs-module/

import express from "express";
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import pool from './db.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

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
wss.on('connection', async function connection(ws) {
    console.log('New client connected');
    ws.authenticated = false;
    await pool.query("\d users");
    console.log(await pool.query("ALTER TABLE users DROP CONSTRAINT users_authtoken_key"));

    ws.on('message', async function message(data) {
        let msg = JSON.parse(data);
        //console.log(await pool.query("SELECT * FROM users"));

        if (msg.type == "createAccount") {
            let user = msg.username;
            let pass = msg.password;
            console.log("Starting account creation");
            let result = await createAccount(user, pass, ws);
            console.log(result);
            
            if (result.status) {
                ws.send(JSON.stringify({type: 'authenticationResult', 'content': result.message, 'token': result.other}));
            } else {
                ws.send(JSON.stringify({type: 'authenticationResult', content: `${result.message}`}));
            }
            
        } else if (msg.type == "login") {
            let result = await verifyCredentials("login", username, password, ws);
            ws.send(JSON.stringify({type:"authenticationResult", content: result.message, token: result.other}));
        } else if (msg.type == "authenticate") {
            let result = await verifyCredentials("authenticate", msg.token, "", ws);
            ws.send(JSON.stringify({type:"authenticationResult", content: result.message, token: result.other}));
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

async function createAccount(username, password, ws) {
    let returnObj = {status: false, message: '', other: ''};
    let result = await pool.query(`SELECT EXISTS (SELECT 1 FROM users WHERE username = '${username}');`);
    if (result.rows[0].exists) {
        console.log("Username Taken!");
        returnObj.status = false;
        returnObj.message = "Sorry, that username is not available."
        return returnObj;
    } 

    console.log("Getting hashes......");
    let hashedPass = await hashString(password);

    result = await pool.query("INSERT INTO users (username, hashedPassword, role) VALUES ($1, $2, $3)", [username, hashedPass, 'user']);

    if (result.rowCount >= 1) {
        returnObj.status = true;
        returnObj.message = "Account created successfully!";
        let id = await pool.query("SELECT id FROM users  WHERE username = ($1)", [username]);
        returnObj.other = generateToken(username, id);

        ws.authenticated = true;
        ws.username = username;
        ws.userId = id;
        clients.set(username, ws);

        return returnObj;
    } else {
        returnObj.status = false;
        returnObj.message = "An error occurred during account creation.";
        
        return returnObj;
    }

};

async function verifyCredentials(type, username, password, ws) {
    let returnObj = {status:false, message:''};
    if (type == "login") {
        try {
            const hashedPass = await pool.query("SELECT hashedPassword FROM users WHERE username = ($1)",[username]);
            const id = await pool.query("SELECT id FROM users WHERE username = ($1)",[username]);
            if (bcrypt.compare(password, hashedPass)) {
                const token = generateToken(username, id);
                returnObj.status = true;
                returnObj.message = "Authentication Successful!";
                returnObj.other = token;

                ws.authenticated = true;
                ws.username = username;
                ws.userId = id;
                clients.set(username, ws);

            } else {
                returnObj.status = false;
                returnObj.message = "The entered username and password are not correct.";
            }
        } catch (error) {
            returnObj.status = false;
            returnObj.message = "An error occurred during login. Please try again.";
        }
    } else if (type == "authenticate") {
        try {
            let payload = jwt.decode(username);

            if (jwt.verify(username)) {
                ws.authenticated = true;
                ws.username = payload.username;
                ws.userId = payload.id;
                clients.set(username, ws);

            }
        } catch (error) {
            returnObj.status = false;
            returnObj.message = "An error occurred during authentication. Please try again.";
        }
    }

    return returnObj;
};

function sendMessage() {

};

async function hashString(input) {
    console.log("Hash function called: "+input)

    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(input, salt);

        return hash;
    } catch (error) {
        console.log("ATTENTION: Error during hashing.");
        return -1;
    }
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

function generateToken(user, id) {
    const payload = {username: user, userId: id};
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
    role TEXT,
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