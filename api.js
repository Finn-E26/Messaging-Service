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
import { timeStamp } from "console";

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

pool.query("DELETE FROM users");
pool.query("DELETE FROM messages");

const wss = new WebSocketServer({ server });
wss.on('connection', async function connection(ws) {
    console.log('New client connected');
    ws.authenticated = false;
    ws.send("You have connected successfully!")
    
    //console.log(await pool.query("ALTER TABLE users DROP CONSTRAINT users_authtoken_key"));

    ws.on('message', async function message(data) {
        let msg = JSON.parse(data);
        //console.log(await pool.query("SELECT * FROM users"));

        if (msg.type == "createAccount") {
            const user = msg.username;
            const pass = msg.password;
            console.log("Starting account creation");
            let result = await createAccount(user, pass, ws);
            console.log(result);
            
            if (result.status) {
                ws.send(JSON.stringify({type: 'authenticationResult',status:result.status, 'content': result.message, 'token': result.other}));
            } else {
                ws.send(JSON.stringify({type: 'authenticationResult',status:result.status, content: `${result.message}`}));
            }
            
        } else if (msg.type == "login") {
            let result = await verifyCredentials("login", msg.username, msg.password, ws);
            ws.send(JSON.stringify({type:"authenticationResult", status:result.status, content: result.message, token: result.other}));
            getQueuedMessages(ws);
        } else if (msg.type == "authenticate") {
            let result = await verifyCredentials("authenticate", msg.token, "", ws);
            ws.send(JSON.stringify({type:"authenticationResult", status:result.status, content: result.message, token: result.other}));
        } else if (msg.type == "sendMessage") {
            if (ws.authenticated == true) {
                const recipient = msg.recipient;

                const client = clients.get(recipient)
                
            
                if (client) {
                    console.log("Option 1, Username test: "+ws.username);

                    let time = new Date().getUTCSeconds();

                    client.send(JSON.stringify({type:'incomingMessage', sender:ws.username, message:msg.message, timeStamp:time}));

                    client.send("Incoming Message from: "+ws.username+", Message: "+msg.message);
                    pool.query("INSERT INTO messages (sender, receiver, message, delivered) VALUES ($1, $2, $3, $4)",[ws.username, msg.recipient, msg.message, true]);             
                } else {
                    pool.query("INSERT INTO messages (sender, receiver, message, delivered) VALUES ($1, $2, $3, $4)",[ws.username, msg.recipient, msg.message, false]);
                }
                ws.send(JSON.stringify({type: 'messageResult', status:true, content: 'Message delivered to the system.'}))
            } else {
                ws.send(JSON.stringify({type: 'messageResult', status:false, content:'You are not authenticated.'}));
            }
        } else if (msg.type == "loadConversation") {
            if (ws.authenticated == true) {
                getMessages(ws, msg.sender);
            } else {
                ws.send(401);
            }
        }

        const messageText = data.toString();
        console.log('Received:', messageText);
        


    });

    ws.on('close', function close() {
        console.log('Client disconnected');
        if (clients.get(ws.username)) {
            clients.delete(ws.username);
        }
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

async function getMessages(webSocket, sender) {
    const username = webSocket.username;
    let response = await pool.query("SELECT * FROM messages WHERE receiver = $1 AND sender = $2 AND delivered = TRUE",[username, sender]);

    if (response.rowCount > 0) {
        for (let i = 0; i<response.rowCount; i++) {
            let messageJSON = {type:'loadMessages', 'sender':response.rows[i].sender, message:response.rows[i].message, timeStamp:0};
            webSocket.send(JSON.stringify(messageJSON));
        }
    }
}

async function getQueuedMessages(webSocket) {
    const username = webSocket.username;
    console.log("Option 2, username test: "+username+", "+webSocket.username);
    let response = await pool.query("SELECT * FROM messages WHERE receiver = $1 AND delivered = $2",[username,false]);

    if (response.rowCount > 0) {
        for (let i = 0; i<response.rowCount; i++) {
            let messageJSON = {type:'incomingMessage', sender:response.rows[i].sender, message:response.rows[i].message, timeStamp:0};
            webSocket.send(JSON.stringify(messageJSON));
            //console.log(JSON.stringify(response.rows[i]));
        }

        try {
           pool.query("UPDATE messages SET delivered = TRUE WHERE receiver = $1 AND delivered = FALSE",[webSocket.username]); 
        } catch (error) {
            console.log(error);
        }
    }
    console.log("Received response from db");
    //console.log(response);
}

async function verifyCredentials(type, username, password, ws) {
    let returnObj = {status:false, message:''};
    if (type == "login") {
        console.log("Logging in: "+username+", "+password);
        try {
            let hashedPass = await pool.query("SELECT hashedpassword FROM users WHERE username = $1",[username]);
            console.log(hashedPass);
            hashedPass = hashedPass.rows[0].hashedpassword;
            console.log(hashedPass);

            let id = await pool.query("SELECT id FROM users WHERE username = $1",[username]);

            if (await bcrypt.compare(password, hashedPass)) {
                console.log(hashedPass);
                let token = generateToken(username, id);
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

            if (jwt.verify(username, process.env.JWT_SECRET)) {
                ws.authenticated = true;
                ws.username = payload.username;
                ws.userId = payload.id;

                returnObj.status = true;
                returnObj.message = "Token Authentication Successful!";

                clients.set(username, ws);

            }
        } catch (error) {
            console.log(error);
            returnObj.status = false;
            returnObj.message = "An error occurred during authentication. Please try again.";
        }
    }

    return returnObj;
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