require("dotenv").config();
const axios = require("axios");
const EVENT_SUB_URL = "https://api.twitch.tv/helix/eventsub/subscriptions";

// Stores App Token details, retrieves App Access Token from Twitch
class AppAccessTokenHeader {
  constructor() {
    this.appAccessToken = null;
    this.appRefreshToken = null;
    this.appTokenExpiry = null;
  }

  get header() {
    return {
      "Client-ID": process.env.CLIENT_ID,
      Authorization: `Bearer ${this.appAccessToken}`,
      "Content-Type": "application/json",
    };
  }

  // TODO: Handle when my app token expires

  async createAppToken() {
    try {
      // URL to Get App Access Token from Twitch
      let url = `https://id.twitch.tv/oauth2/token?client_id=${process.env.CLIENT_ID}&client_secret=${process.env.CLIENT_SECRET}&grant_type=client_credentials&scope=channel:read:subscriptions`;

      // OAuth Request to get the App Access Token (used in header for subscription POST requests)
      const respPost = await axios.post(url);
      if (respPost.status !== 200) {
        throw "Could not retrieve App Access Token";
      }
      this.appAccessToken = respPost.data?.access_token;
      this.appRefreshToken = respPost.data?.refresh_token;
      this.appTokenExpiry = respPost.data?.expires_in;
    } catch (e) {
      console.log(e);
    }
  }
}

const tokenHeader = new AppAccessTokenHeader();

// Creates App Access Token -> calls updateSubscriptions
const initiateSubscriptions = async () => {
  try {
    await tokenHeader.createAppToken();

    // After getting the App Access Token -> delete all existing event subscriptions and create new ones
    await deleteExistingSubscriptions();
    await addNewSubscriptions();
  } catch (e) {
    console.log(e);
  }
};

const dispatchAPI = (method, url, data = {}) => {
  return axios({
    method,
    url,
    data,
    headers: tokenHeader.header,
  });
};

// Returns a POST request for subscribing to follow events
const createSubscription = (followOrSubscribe) => {
  const body = {
    type: `channel.${followOrSubscribe}`,
    version: "1",
    condition: {
      broadcaster_user_id: process.env.BROADCASTER_ID,
    },
    transport: {
      method: "webhook",
      callback: `${process.env.NGROK_TUNNEL}/webhooks/${followOrSubscribe}`,
      secret: process.env.SECRET, //AT LEAST 10 Chars long
    },
  };

  return dispatchAPI("post", EVENT_SUB_URL, body);
};

const deleteExistingSubscriptions = async () => {
  try {
    const respGet = await dispatchAPI("get", EVENT_SUB_URL);

    if (respGet.status !== 200) {
      throw "Cannot get existing subscriptions";
    }

    let unsubscribePromises = [];
    respGet.data.data?.forEach((oldSub) => {
      unsubscribePromises.push(
        dispatchAPI("delete", `${EVENT_SUB_URL}?id=${oldSub["id"]}`)
      );
    });

    const deleteOldSubscriptions = await Promise.all(unsubscribePromises);

    deleteOldSubscriptions.forEach((respDelete) => {
      if (Math.floor(respDelete.status / 100) !== 2) {
        throw "Cannot delete existing subscriptions";
      }
    });
  } catch (e) {
    console.log(e);
  }
};

const addNewSubscriptions = async () => {
  try {
    const addNewSubscriptions = await Promise.all([
      createSubscription("follow"),
      createSubscription("subscribe"),
    ]);
    addNewSubscriptions.forEach((respAdd) => {
      if (Math.floor(respAdd.status / 100) !== 2) {
        throw "Cannot add new subscriptions";
      }
    });
  } catch (e) {
    console.log(e);
  }
};

module.exports = { initiateSubscriptions };
