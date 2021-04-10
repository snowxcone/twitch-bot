require("dotenv").config();
const tmi = require("tmi.js");
const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const open = require("open");
const axios = require("axios");
const app = express();
const port = 8080;
const subscriber = require("./subscriber.js");

// Define configuration options
const opts = {
  // options: {debug: true},
  identity: {
    username: process.env.TWITCH_USERNAME,
    password: process.env.TWITCH_OAUTH_TOKEN, // from https://twitchapps.com/tmi/
  },
  channels: [process.env.TWITCH_USERNAME],
};

// Create a client with our options
const client = new tmi.client(opts);

// Keep track of latest follower/subscriber to prevent duplicated messages/spam
let lastFollower;
let lastSubscriber;

// User Token for accessing who is subscribed to my channel
let userToken;

// Sets req.verified for message POST requests to verify the challenge header's authenticity
app.use(
  bodyParser.json({
    verify: checkSig,
  })
);

// Register our event handlers (defined below)
client.on("message", onMessageHandler);
client.on("connected", onConnectedHandler);

// Connect to Twitch
client.connect();

// Map of winners for Rock Paper Scissors game
const winners = {};
winners["rock"] = ["paper"];
winners["paper"] = ["scissors"];
winners["scissors"] = ["rock"];
const choices = Object.keys(winners);

// Called every time a message comes in
function onMessageHandler(target, context, msg, self) {
  if (self) return; // Ignore messages from the bot

  // Splits message based on the first occurrence of a space
  let commandRaw = msg.trim().toLowerCase().split(/ (.+)/);
  if (typeof commandRaw == undefined) return;

  let commandName = commandRaw[0];
  let commandInput = commandRaw[1];

  // Bot commands
  if (commandName[0] == "!") {
    // If the command is known -> execute it
    if (commandName === "!coco") {
      client.say(target, "snowxcCoco");
      console.log(`* Executed ${commandName} command`);
    } else if (commandName === "!subraid") {
      client.say(
        target,
        "snowxcHype snowxcHype snowxcHype Snow is falling into chat #SnowxconesRaid snowxcBoop snowxcHype snowxcHype snowxcHype Snow is falling into chat #SnowxconesRaid snowxcBoop snowxcHype snowxcHype snowxcHypeSnow is falling into chat #SnowxconesRaid snowxcBoop"
      );
      console.log(`* Executed ${commandName} command`);
    } else if (commandName === "!rps") {
      let userChoice = commandInput;
      client.say(target, rps(userChoice));
      console.log(
        `* Executed ${commandName} command with user choice ${userChoice}`
      );
    } else if (commandName === "!hug") {
      let hugRecipient = commandInput;
      let msg;
      if (hugRecipient) {
        msg = `${context.username} wraps ${hugRecipient} in a polar bear hug snowxcHug snowxcHug snowxcHug`;
      } else {
        msg = `${context.username} has no one to hug......`;
      }

      client.say(target, msg);
      console.log(
        `* Executed ${commandName} command with hug recipient ${hugRecipient}`
      );
    } else if (commandName === "!workingon") {
      let msg = `${context.username}, thanks for asking! Snow is currently working on making a website 
      using pure html/css, no javascript.`;
      client.say(target, msg);
    }
    
    else {
      console.log(`* Unknown command ${commandName}`);
    }
  }

  // Spam checking
  if (msg.toLowerCase().includes("want more follower")) {
    client.say(target, `/timeout ${context.username} 300`);
  }

  // TODO: If there's x repeated consecutive messages
  // send axios request to check if raid was recent
  // if not, timeout
}

// ChoosenEye's implementation of Rock Paper Scissors
function rps(userChoice) {
  if (!choices.includes(userChoice)) {
    return "Please type !rps followed by rock, paper, or scissors to play!";
  }

  let botChoice = choices[Math.floor(Math.random() * 3)]; // picks the 0th ("rock"), 1st ("paper"), or 2nd ("scissors") indexed item in the choices array
  let botChoiceStr = `I chose ${botChoice}. `;
  if (userChoice == botChoice)
    return botChoiceStr + "A tie.. rematch? snowxcAngel";
  if (winners[userChoice].includes(botChoice))
    return botChoiceStr + "You lose, I win!! hehehehehe snowxcHype";
  return botChoiceStr + "You win, I lose!! snowxcFisticuffs";
}

// Called every time the bot connects to Twitch chat
function onConnectedHandler(addr, prt) {
  console.log(`* Connected to ${addr}:${prt}`);
}

// Check if each message's signature matches with the hash created with our secret
function checkSig(req, res, buf, encoding) {
  req.twitch_hub = false; // is there a hub to verify against
  if (req.headers?.hasOwnProperty("twitch-eventsub-message-signature")) {
    req.twitch_hub = true;
    let id = req.headers["twitch-eventsub-message-id"];
    let timestamp = req.headers["twitch-eventsub-message-timestamp"];

    let received = req.headers["twitch-eventsub-message-signature"].split(
      "="
    )[1];
    let expected = crypto
      .createHmac("sha256", process.env.SECRET)
      .update(id + timestamp + buf)
      .digest("hex");

    req.verified = received === expected;
    if (!req.verified) {
      throw "Wrong challenge was sent";
    }
  }
}

// Bot requests read access from my channel via Twitch
open(
  `https://id.twitch.tv/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${process.env.NGROK_TUNNEL}/auth&response_type=code&scope=channel:read:subscriptions user:read:subscriptions user_subscriptions`
);

// If my channel grants access, my bot is redirected to my redirect URI where we store the authcode and make a POST request to get the user token
app.get("/auth", (req, res) => {
  let authcode = req.query?.code;

  let userUrl = `https://id.twitch.tv/oauth2/token?client_id=${process.env.CLIENT_ID}&client_secret=${process.env.CLIENT_SECRET}&code=${authcode}&grant_type=authorization_code&redirect_uri=${process.env.NGROK_TUNNEL}/auth&scope=channel:read:subscriptions`;
  axios
    .post(userUrl)
    .then((resp) => {
      userToken = resp.data.access_token;
      console.log("Saved user token!");
    })
    .catch((e) => console.log(e));

  res.status(200).send("Retrieved user token!");
});

// Define express endpoints
app.post("/webhooks/follow", function (req, res) {
  const messageType = req.header("Twitch-Eventsub-Message-Type");

  if (messageType === "webhook_callback_verification" && req.body.challenge) {
    console.log("Received and sent challenge for follow subscription");
    return res.status(200).send(req.body.challenge);
  } else if (messageType === "notification" && req.twitch_hub && req.verified) {
    const follower = req.body.event.user_name;
    if (follower !== lastFollower) {
      client.say(
        "#snowxcones",
        `♡ snowxcAngel A new snowflake has fallen into our lives! Welcome ${follower} snowxcAngel ♡`
      );
      lastFollower = follower;
    }
    return res.status(200).send("Successful follow notification");
  } else {
    return res.status(403).send("Forbidden follow notification");
  }
});

app.post("/webhooks/subscribe", function (req, res) {
  const messageType = req.header("Twitch-Eventsub-Message-Type");

  if (messageType === "webhook_callback_verification" && req.body.challenge) {
    console.log("Received and sent challenge for subscribe subscription");
    return res.status(200).send(req.body.challenge);
  } else if (messageType === "notification" && req.twitch_hub && req.verified) {
    console.log("received test sub");
    const subscriber = req.body.event.user_name;
    const configs = {
      headers: {
        "Client-ID": process.env.CLIENT_ID,
        Authorization: `Bearer ${userToken}`,
        "Content-Type": "application/json",
      },
    };
    if (subscriber !== lastSubscriber) {
      const msg = `${subscriber}, I hope you like kids because you're now a polar bear parent snowxcShook snowxcShook snowxcShook Each sub badge is a new milestone in your polar bear child's life.. Godspeed!! snowxcHype `;
      if (req.body.event.is_gift) {
        axios
          .get(
            `https://api.twitch.tv/helix/subscriptions?broadcaster_id=${process.env.BROADCASTER_ID}&user_id=${req.body.event.user_id}`,
            configs
          )
          .then((resp) => {
            const gifter = resp.data?.data[0].gifter_name;
            if (gifter) {
              client.say(
                "#snowxcones",
                msg +
                  `Don't forget to tell ${gifter} how you feel about their confidence in your parenting abilities snowxcAngel snowxcAngel snowxcAngel`
              );
            }
          })
          .catch((e) => console.log(e));
      } else {
        client.say("#snowxcones", msg);
      }
      lastSubscriber = subscriber;
    }
    return res.status(200).send("Successful subscribe notification");
  } else {
    return res.status(403).send("Forbidden subscribe notification");
  }
});

// Start express server
app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});

subscriber.initiateSubscriptions();
