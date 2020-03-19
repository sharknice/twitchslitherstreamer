var TwitchClient = require('twitch').default;
var ChatClient = require('twitch-chat-client').default;
var fs = require('fs-extra');
var needle = require('needle');

(async () => {
    var sharkBot = this;
    sharkBot.launchTime = (new Date).getTime();
    sharkBot.un = 'sharkboteliteownage';
    sharkBot.confidenceThreshold = 0.89;
    sharkBot.voiceConfidenceThreshold = 0.89;
    sharkBot.whisperThreshold = .5;
    sharkBot.talkingNow = false;

    sharkBot.updateChat = function (chatRequest) {
        needle.put('http://localhost:50446/api/chatupdate',
            chatRequest, { json: true }, (err, res) => {
                if (err) {
                    console.error(err);
                }
            });
    };

    sharkBot.getResponse = function (chatRequest, optional) {
        needle.put('http://localhost:50446/api/chat',
            chatRequest, { json: true }, (err, res) => {
                if (err) {
                    console.error(err);
                }
                else if (res && res.body) {
                    if (!optional || (optional && res.body.confidence >= sharkBot.confidenceThreshold)) {
                        sharkBot.respond(res.body, chatRequest);
                    }
                } else {
                    console.log("no response");
                }
            });
    };

    sharkBot.getWhisperResponse = function (chatRequest) {
        needle.put('http://localhost:50446/api/chat',
            chatRequest, { json: true }, (err, res) => {
                if (err) {
                    console.error(err);
                }
                else if (res && res.body) {
                    if (res.body.confidence >= sharkBot.whisperThreshold) {
                        var totalTypeTime = 0;
                        res.body.response.forEach(message => {
                            totalTypeTime += message.length * 80;
                            setTimeout(function () {
                                chatClient.whisper(res.body.metadata.whisper, message);
                                const responseChatRequest = sharkBot.getRequest('private-message-' + res.body.metadata.whisper, res.body.metadata.whisper, message);
                                sharkBot.updateChat(responseChatRequest);
                            }, totalTypeTime);
                        });
                    }
                } else {
                    console.log("no response");
                }
            });
    };

    sharkBot.respond = function (response, request) {
        sharkBot.updateChat(request);
        if (response.confidence >= sharkBot.voiceConfidenceThreshold) {
            var voiceMssage = '';
            response.response.forEach(message => {
                voiceMssage += message + ' ';
            });
            sharkBot.speak(voiceMssage, 2);
        }
        var totalTypeTime = 0;
        response.response.forEach(message => {
            totalTypeTime += message.length * 80;
            setTimeout(function () {
                chatClient.say(response.metadata.channel, message);              
            }, totalTypeTime);
        });
    };

    sharkBot.speak = function (message, priority) {
        needle.put('http://localhost:8081/twitchchat',
            {message: message, priority: priority}, { json: true }, (err, res) => {
                if (err) {
                    console.error(err);
                }
            });
    };

    sharkBot.getRequest = function (channel, user, message) {
        var chat = { user: user, message: message, botName: sharkBot.un };
        var metadata = { channel: channel, confidenceThreshold: sharkBot.confidenceThreshold };
        var chatRequest = { chat: chat, conversationName: "twitchtv-" + channel + "-" + sharkBot.launchTime, type: 'twitchtv', time: (new Date).getTime(), metadata: metadata };
        return chatRequest;
    };

    const clientData = JSON.parse(await fs.readFile('secrets.json', 'UTF-8'));
    const clientSecret = clientData.clientSecret;
    const clientId = clientData.clientId;
    const tokenData = JSON.parse(await fs.readFile('tokens.json', 'UTF-8'));
    const twitchClient = TwitchClient.withCredentials(clientId, tokenData.accessToken, undefined, {
        clientSecret,
        refreshToken: tokenData.refreshToken,
        expiry: tokenData.expiryTimestamp === null ? null : new Date(tokenData.expiryTimestamp),
        onRefresh: async ({ accessToken, refreshToken, expiryDate }) => {
            const newTokenData = {
                accessToken,
                refreshToken,
                expiryTimestamp: expiryDate === null ? null : expiryDate.getTime()
            };
            await fs.writeFile('tokens.json', JSON.stringify(newTokenData, null, 4), 'UTF-8')
        }
    });

    const chatClient = await ChatClient.forTwitchClient(twitchClient, { channels: ['sharkboteliteownage'] });
    await chatClient.connect();

    chatClient.onPrivmsg((channel, user, message) => {
        const chatRequest = sharkBot.getRequest(channel, user, message);
        if (user == 'sharkboteliteownage') {
            sharkBot.updateChat(chatRequest);
        }
        else if (message.startsWith("!")) {
            // ignore commands
        } else {
            if (message.indexOf(sharkBot.un) > -1 || message.indexOf("sharkbot") > -1) {
                sharkBot.getResponse(chatRequest, false);
            } else {
                sharkBot.getResponse(chatRequest, true);
            }
        }
    });

    chatClient.onWhisper((user, message) => {
        const chatRequest = sharkBot.getRequest('private-message-' + user, user, message);
        chatRequest.metadata.whisper = user;
        sharkBot.getWhisperResponse(chatRequest);
    });

    chatClient.onSub((channel, user) => {
        var message = `Thanks to @${user} for subscribing to the channel!`;
        chatClient.say(channel, message);
        sharkBot.speak(message, 1);
    });
    chatClient.onResub((channel, user, subInfo) => {
        var message = `Thanks to @${user} for subscribing to the channel for a total of ${subInfo.months} months!`;
        chatClient.say(channel, message);
        sharkBot.speak(message, 1);
    });
    chatClient.onSubGift((channel, user, subInfo) => {
        var message = `Thanks to ${subInfo.gifter} for gifting a subscription to ${user}!`;
        chatClient.say(channel, message);
        sharkBot.speak(message, 1);
    });
})();