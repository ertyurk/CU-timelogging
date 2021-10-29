/*

  This is an automation that helps you to follow up domains.
  - get your Free API KEY & SECRET and put below
  - Create a spreadsheet in your google drive. 
  - Create 2 sheets as per below
    - DOMAINS
      - Headers: Domains
    - RESULT
      - Headers: Domain, Availability,  Price
  - Create slack webhook for notifications

  You can schedule the script main on daily basis and once domain is dropped to free, 
  then you will receive a slack notification

*/


const KEY = "<GO DADDY KEY>"
const SECRET = "<GO DADDY SECRET>"
const HOOK = "<SLACK WEBHOOK>"

const onOpen = async () => {
  var sheet = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Domain Controller 📌')
    .addItem('🚀  Get Available Domains', 'main')
    .addToUi();
}


const main = async () => {
  await purgeOldDomainsFromSheet('RESULT');
  var domains = await getDomainsFromSheet();
  domains.forEach(async domain => {
    await getAvailableDomainsFromGoDaddy(domain)
  })
}

const getDomainsFromSheet = async () => {
  var activeSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DOMAINS");
  var rows = activeSheet.getLastRow();
  var domains = [];
  for (var i = 2; i <= rows; i++) {
    var domain = activeSheet.getRange(`A${i}:A`).getValue();
    domains.push(domain)
  }
  return domains;
}

const getAvailableDomainsFromGoDaddy = async (domain) => {
  var url = `https://api.godaddy.com/v1/domains/available?domain=${domain}&checkType=FULL&forTransfer=false`
  var options = {
    "method": "get",
    "headers": {
      "accept": "application/json",
      "Authorization": `sso-key ${KEY}:${SECRET}`
    }
  };
  var res = await UrlFetchApp.fetch(url, options);
  var data = JSON.parse(res.getContentText());
  var result = [data.domain, data.available, `${data.price / 1000000}$`];
  SpreadsheetApp.getActive().getSheetByName('RESULT').appendRow(result);
  if (data.available != false) {
    sendMsgToSlack(result)
  } else {
    Logger.log(`${data.domain} is not available`)
  }
  
  return result;
}

const purgeOldDomainsFromSheet = async (sheet) => {
  SpreadsheetApp.getActive().getSheetByName(sheet).getRange('A2:C').clearContent();
}

const sendMsgToSlack = async (domain) => {
  var payload = {
    "blocks": [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `*${domain[0]}* is available to purchase for *${domain[2]}*`
        },
        "accessory": {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "🚀 BUY",
            "emoji": true
          },
          "url": `https://uk.godaddy.com/domainsearch/find?checkAvail=1&domainToCheck=${domain[0]}`,
          "action_id": "button-action",
          "style": "primary"
        }
      }

    ]
  };
  var options = {
    "method": "post",
    "headers": {
      "Content-type": "application/json",
    },
    "payload": JSON.stringify(payload)
  };
  await UrlFetchApp.fetch(HOOK, options);
}
