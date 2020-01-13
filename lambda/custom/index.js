const Alexa = require('ask-sdk-core');
const https = require("https");
const Airtable = require("airtable");

const numberNames = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty"];

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    async handle(handlerInput) {
        var speakOutput = await getVoiceResponse(handlerInput);
        var dynamicEntities = await getDynamicEntities("Codes");
        if (dynamicEntities != undefined) handlerInput.responseBuilder.addDirective(dynamicEntities)
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const StepIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest"
            && Alexa.getIntentName(handlerInput.requestEnvelope) === "CodeEntryIntent";
    },
    async handle(handlerInput) {
        //TODO: THIS MEANS THAT THEY HAVE FOUND A CLUE.  WE NEED TO PROVIDE THEM WITH THE NEXT CLUE, AND LOG THEIR PROGRESS.
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        var resolvedWords = getResolvedWords(handlerInput, "code");
        if (resolvedWords != undefined) {
            //var numberName = Alexa.getIntentName(handlerInput.requestEnvelope).replace("Step", "");
            var numberName = resolvedWords[0].value.id;
            var arrayPosition = numberNames.indexOf(numberName);
            var slotValue = handlerInput.requestEnvelope.request.intent.slots.code.value;

            var airtable = await new Airtable({apiKey: process.env.airtable_key}).base(process.env.airtable_base_data);
            await airtable('Attempts').create({"User": [sessionAttributes.user.RecordId], "SlotValue": slotValue, "ResolvedWords": JSON.stringify(resolvedWords)}, function(err, record) {if (err) {console.error(err);}});

            if ((sessionAttributes.user["Step"+numberNames[arrayPosition-1]] != undefined)&&(sessionAttributes.user["Step" + numberName] === undefined)) {
                return new Promise((resolve, reject) => {
                    airtable('User').update(
                        [{"id": sessionAttributes.user.RecordId, "fields": {["Step" + numberName]: Date.now()}}],
                            function(err, records) {
                                if (err) { console.error(err);return;}
                                sessionAttributes.user = records[0].fields;
                                if (numberName === "Twenty") resolve(endGame(handlerInput));
                                else resolve(giveClue(handlerInput));
                            }
                    )
                });
            } else { return redirectToClue(handlerInput); }
        }
        else { return redirectToClue(handlerInput); }
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    async handle(handlerInput) {
        //TODO: WE SHOULD PROVIDE THE USER WITH THE HINT FOR THEIR NEXT CLUE.
        const speakOutput = await getVoiceResponse(handlerInput);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        //TODO: COME UP WITH A CLEVER GOODBYE.
        const speakOutput = "Goodbye";

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        //THE USER SAID SOMETHING WE AREN'T EXPECTING.  WE SHOULD ACCUSE THEM OF GUESSING.
        const speakOutput = getRandomSpeechconNAY() + "Maybe you found a clue...or maybe you didn't.  Either way, it seems like you're guessing.  Go find the hint!";

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse(); // notice we send an empty response
    }
};

const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = intentName;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};

const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const speakOutput = "Error";
        console.log(`~~~~ Error handled: ${JSON.stringify(error.stack)}`);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

var speechconsYAY = ["oh snap", "awesome", "bazinga", "bingo", "boom", "booya", "bravo", "cheers", "ding ding ding", "dynomite", "eureka", "excellent", "great", "he shoots he scores", "holy smoke", "hurray", "legendary", "magnificent", "oh snap", "righto", "she shoots she scores", "splendid", "way to go", "woo hoo", "yes", "yippee", "you go girl"];
var speechconsNAY = ["argh", "aw man", "aww applesauce", "blarg", "bummer", "d'oh", "darn", "drat", "fiddlesticks", "no", "oh dear", "oof", "ruh roh", "shoot", "shucks", "uh oh", "wah wah", "whoops a daisy", "yikes", "zoinks"];

function getRandomSpeechconYAY() {
    var random = getRandom(0, speechconsYAY.length-1);
    return "<say-as interpret-as='interjection'>" + speechconsYAY[random] + "!</say-as><break time='.6s'/>";
}

function getRandomSpeechconNAY() {
    var random = getRandom(0, speechconsNAY.length-1);
    return "<say-as interpret-as='interjection'>" + speechconsNAY[random] + "!</say-as><break time='.6s'/>";
}

function getRandom(min, max){
    return Math.floor(Math.random() * (max-min+1)+min);
}

async function giveClue(handlerInput) {
    var speakOutput = getRandomSpeechconYAY() + await getVoiceResponse(handlerInput);
    return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(speakOutput)
        .getResponse();
}

async function redirectToClue(handlerInput) {
    var speakOutput = getRandomSpeechconNAY() + "Maybe you found a clue...or maybe you didn't.  Here's where you should be looking.<break time='1s'/>" + await getVoiceResponse(handlerInput);
    return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(speakOutput)
        .getResponse();
}

function endGame(handlerInput) {
    var speakOutput = getRandomSpeechconYAY() + "Congratulations! You completed the Code Mash Scavenger Hunt! <break time='1s'/>I've written a card to your Alexa app which tells you how to claim your prize.  To find it, open the menu in the Alexa app, and choose Activity from the options.";
    return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(speakOutput)
        .withSimpleCard("Congratulations!", "You finished the Codemash Scavenger Hunt! To claim your prize, text Jeff Blankenburg at (614) 327-5066 with the code GORILLA.  He will coordinate meeting up with you.\n\nThe first ten people to finish this hunt will receive an Echo Flex, but there are also cool stickers for everyone that finishes!")
        .getResponse();
}

function getCurrentNumber(handlerInput)
{
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    if (sessionAttributes.user.StepTwenty != undefined) return 20;
    else if (sessionAttributes.user.StepNineteen != undefined) return 19;
    else if (sessionAttributes.user.StepEighteen != undefined) return 18;
    else if (sessionAttributes.user.StepSeventeen != undefined) return 17;
    else if (sessionAttributes.user.StepSixteen != undefined) return 16;
    else if (sessionAttributes.user.StepFifteen != undefined) return 15;
    else if (sessionAttributes.user.StepFourteen != undefined) return 14;
    else if (sessionAttributes.user.StepThirteen != undefined) return 13;
    else if (sessionAttributes.user.StepTwelve != undefined) return 12;
    else if (sessionAttributes.user.StepEleven != undefined) return 11;
    else if (sessionAttributes.user.StepTen != undefined) return 10;
    else if (sessionAttributes.user.StepNine != undefined) return 9;
    else if (sessionAttributes.user.StepEight != undefined) return 8;
    else if (sessionAttributes.user.StepSeven != undefined) return 7;
    else if (sessionAttributes.user.StepSix != undefined) return 6;
    else if (sessionAttributes.user.StepFive != undefined) return 5;
    else if (sessionAttributes.user.StepFour != undefined) return 4;
    else if (sessionAttributes.user.StepThree != undefined) return 3;
    else if (sessionAttributes.user.StepTwo != undefined) return 2;
    else if (sessionAttributes.user.StepOne != undefined) return 1;
    else return 0;
}

async function getVoiceResponse(handlerInput) {
    var order = getCurrentNumber(handlerInput);
    console.log("ORDER = JJ" + order + "JJ");
    var voiceResponse = "Welcome to the Code Mash Alexa Scavenger Hunt!  The adventure begins at the giant bronze gorilla at the entrance to the Kalahari convention center.  There, you will find your first password.  Come back and tell me the first password, and I'll tell you where the next hint is!";
    
    if (order > 0) {
        console.log("ORDER > 0");
        const result = await httpGet(process.env.airtable_base_data, "&filterByFormula=AND(Order%3D%22" + encodeURIComponent(order) + "%22)", "Codes");
        return result.records[0].fields.VoiceResponse;
    }
    else return voiceResponse;
    
}

async function GetUserRecord(userId) {
    console.log("GETTING USER RECORD")
    var filter = "&filterByFormula=%7BUserId%7D%3D%22" + encodeURIComponent(userId) + "%22";
    const userRecord = await httpGet(process.env.airtable_base_data, filter, "User");
    //IF THERE ISN"T A USER RECORD, CREATE ONE.
    if (userRecord.records.length === 0){
        console.log("CREATING NEW USER RECORD");
        var airtable = new Airtable({apiKey: process.env.airtable_key}).base(process.env.airtable_base_data);
        return new Promise((resolve, reject) => {
            airtable("User").create({"UserId": userId}, 
                        function(err, record) {
                                console.log("NEW USER RECORD = " + JSON.stringify(record));
                                if (err) { console.error(err); return; }
                                resolve(record);
                            });
                        });
    }
    else{
        console.log("RETURNING FOUND USER RECORD = " + JSON.stringify(userRecord.records[0]));
        const result = await httpGet(process.env.airtable_base_data, "&filterByFormula=AND(RecordId%3D%22" + encodeURIComponent(userRecord.records[0].fields.RecordId) + "%22)", "User");
        return await result.records[0];
    }
}

async function getDynamicEntities(slot) {
    const result = await httpGet(process.env.airtable_base_data, "", slot);
    console.log("RESULTS = " + JSON.stringify(result.records));
    var slotValues = [];

    for (var i = 0;i<result.records.length;i++) {
        var value = {id:result.records[i].fields.Id, name:{value:result.records[i].fields.Code}};
        slotValues[i] = value;
    }

    let entityDirective = {
        type: "Dialog.UpdateDynamicEntities",
        updateBehavior: "REPLACE",
        types: [
            {
            name: slot,
            values: slotValues
            }
        ]
    };

    return entityDirective;
}

function getResolvedWords(handlerInput, slot) {
    if (handlerInput.requestEnvelope
        && handlerInput.requestEnvelope.request
        && handlerInput.requestEnvelope.request.intent
        && handlerInput.requestEnvelope.request.intent.slots
        && handlerInput.requestEnvelope.request.intent.slots[slot]
        && handlerInput.requestEnvelope.request.intent.slots[slot].resolutions
        && handlerInput.requestEnvelope.request.intent.slots[slot].resolutions.resolutionsPerAuthority
        && handlerInput.requestEnvelope.request.intent.slots[slot].resolutions.resolutionsPerAuthority[0]
        && handlerInput.requestEnvelope.request.intent.slots[slot].resolutions.resolutionsPerAuthority[0].values
        && handlerInput.requestEnvelope.request.intent.slots[slot].resolutions.resolutionsPerAuthority[0].values[0])
        return handlerInput.requestEnvelope.request.intent.slots[slot].resolutions.resolutionsPerAuthority[0].values;

    if (handlerInput.requestEnvelope
        && handlerInput.requestEnvelope.request
        && handlerInput.requestEnvelope.request.intent
        && handlerInput.requestEnvelope.request.intent.slots
        && handlerInput.requestEnvelope.request.intent.slots[slot]
        && handlerInput.requestEnvelope.request.intent.slots[slot].resolutions
        && handlerInput.requestEnvelope.request.intent.slots[slot].resolutions.resolutionsPerAuthority
        && handlerInput.requestEnvelope.request.intent.slots[slot].resolutions.resolutionsPerAuthority[1]
        && handlerInput.requestEnvelope.request.intent.slots[slot].resolutions.resolutionsPerAuthority[1].values
        && handlerInput.requestEnvelope.request.intent.slots[slot].resolutions.resolutionsPerAuthority[1].values[0])
        return handlerInput.requestEnvelope.request.intent.slots[slot].resolutions.resolutionsPerAuthority[1].values;

    return undefined;
}

const RequestLog = {
    async process(handlerInput) {
        console.log("REQUEST ENVELOPE = " + JSON.stringify(handlerInput.requestEnvelope));
        var userRecord = await GetUserRecord(handlerInput.requestEnvelope.session.user.userId);
        console.log("USER RECORD = " + JSON.stringify(userRecord.fields));
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        sessionAttributes.user = userRecord.fields;
        return;
    }
};
  
const ResponseLog = {
    process(handlerInput) {
        console.log("RESPONSE BUILDER = " + JSON.stringify(handlerInput.responseBuilder.getResponse()));   
    }
};

function httpGet(base, filter, table = "Data"){
    //console.log("IN HTTP GET");
    //console.log("BASE = " + base);
    //console.log("FILTER = " + filter);
    
    var options = {
        host: "api.airtable.com",
        port: 443,
        path: "/v0/" + base + "/" + table + "?api_key=" + process.env.airtable_key + filter,
        method: "GET",
    };

    console.log("FULL PATH = http://" + options.host + options.path);
    
    return new Promise(((resolve, reject) => {
      const request = https.request(options, (response) => {
        response.setEncoding("utf8");
        let returnData = "";

  
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return reject(new Error(`${response.statusCode}: ${response.req.getHeader("host")} ${response.req.path}`));
        }
        
        //console.log("HTTPS REQUEST OPTIONS = " + JSON.stringify(options));
  
        response.on("data", (chunk) => {
          returnData += chunk;
        });
  
        response.on("end", () => {
          resolve(JSON.parse(returnData));
        });
  
        response.on("error", (error) => {
          reject(error);
        });
      });
      request.end();
    }));
}

exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        StepIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler)
    .addErrorHandlers(ErrorHandler)
    .addRequestInterceptors(RequestLog)
    .addResponseInterceptors(ResponseLog)
    .lambda();
