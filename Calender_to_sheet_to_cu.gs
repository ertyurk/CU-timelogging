/*
  1. Create a google sheet with 3 pages
    1. config
      Headers: Name,	Clickup Api Key,	User ID,	Team ID,	List ID,	Target Task Status,	Keywords (comma seperated keywords)
    2. entries
      Headers: Name,	Description,	Relation,	Start,	End,	Epoch,	Hrs,	Status,	Tag,	Log Note,	Task,	UDID,			
    3. archive
      Headers: Name,	Description,	Relation,	Start,	End,	Epoch,	Hrs,	Status,	Tag,	Log Note,	Task,	UDID,	

  2. Put related config to the "config" sheet from A2 cell.
  
  3. Go to the Extensions > Google Apps Script
  4. Add a file as "CONFIG.gs" and copy following code.
  5. Copy the remaining code to the Code.gs
  
*/



/*Copy to CONFIG.gs*/

const CONFIG = async() =>{ 
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("config");
  const lastRow = sheet.getLastRow();
  const final = [];
  for (let i = 2; i <= lastRow; i++) {
    const configs = sheet.getRange(`A${i}:H${i}`).getValues();
    for (const config of configs) {
      var data = {}
      data.name = config[0];
      data.clickupApiKey = config[1];
      data.userId = config[2].toString();
      data.team_id = config[3].toString();
      data.list = config[4].toString();
      data.taskStatus = config[5];
      data.keywords = config[6].split(",");
      if (config[7]) data.fallback = config[7];
      final.push(data);
    };
  };
  
  return final;
};


/*Copy to Code.gs*/
const SLACK_HOOK = "<Slack webhook here>";

const onOpen = () => {
  SpreadsheetApp.getUi().createMenu('Event menu')
    .addItem('🗓️  -  Retrieve meetings', 'getMeetings')
    .addItem('🚀  -  Push to Clickup', 'recordHandler')
    .addItem('🗄️  -  Archive entries', 'archive')
    .addToUi();
}

const recordHandler = async () => {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("entries");
  const lastRow = sheet.getLastRow();
  for (var i = 2; i <= lastRow; i++) {
    const meetings = sheet.getRange(`A${i}:M${i}`).getValues();
    for (meeting of meetings) {
      if (meeting[7] != 'Success') {
        var data = {
          task_name: meeting[0],
          description: meeting[1],
          duration: meeting[5],
          duration_hrs: meeting[6],
          start_date: meeting[3].getTime() / 1000,
          relation: meeting[2],
          tag: meeting[8],
          time_log_note: meeting[9],
          time_log_status: meeting[7],
          udid: meeting[11]
        }

        const cfg = await getConfig(data.relation);
        const is_created = await isTaskCreated(data.task_name, data.description);
        if (is_created.status == true) {
          await timeEntry(data, cfg, is_created.task);
        } else {
          await createTask(data, cfg);
        }
        
      }
    }
  }
}

const createTask = async (data, cfg) => {
  try {
    let url = `https://api.clickup.com/api/v2/list/${cfg.list}/task`;
    let payload = {
      name: data.task_name,
      description: data.description,
      tags: [data.tag],
      status: cfg.taskStatus,
    }

    let params = {
      method: 'POST',
      muteHttpExceptions: true,
      contentType: 'application/json',
      headers: {
        "Content-Type": "application/json",
        "Authorization": cfg.clickupApiKey
      }, "payload": JSON.stringify(payload)
    }

    let r = UrlFetchApp.fetch(url, params);
    let res = JSON.parse(r.getContentText());
    let header = JSON.parse(r.getResponseCode());
    switch (header) {
      case 300:
      case 301:
      case 400:
      case 404:
      case 500:
        Logger.log('Task creation failed')
        break;
      default:
        await timeEntry(data, cfg, res.id);
    }

  } catch (e) {
    Logger.log(e)
  }
}

const timeEntry = async (data, cfg, taskId) => {
  console.log(data, cfg, taskId)
  var url = `https://api.clickup.com/api/v2/team/${cfg.team_id}/time_entries`;
  var payload = {
    "description": data.time_log_note,
    "start": data.start_date * 1000,
    "billable": true,
    "duration": data.duration,
    "assignee": Number(cfg.userId),
    "tid": taskId
  }

  var params = {
    'method': 'POST',
    'muteHttpExceptions': true,
    'contentType': 'application/json',
    "headers": {
      "Content-Type": "application/json",
      "Authorization": cfg.clickupApiKey
    }, "payload": JSON.stringify(payload)
  };

  console.log(params)
  var res = UrlFetchApp.fetch(url, params);
  var header = JSON.parse(res.getResponseCode());
  switch (header) {
    case 200:
      Logger.log(`Duration time entried to the Clickup for ${data.task_name}`)
      await findRowByMeetingId(data.udid, 'Success', taskId)
      break;
    case 404 || 500:
      Logger.log('Time Entry failed')
      Logger.log(res.getContentText())
      await findRowByMeetingId(data.udid, 'Failed', taskId)
      break;
    case 400:
      Logger.log('Access error')
      Logger.log(res.getContentText())
      await findRowByMeetingId(data.udid, 'AUTH', taskId)
      break;
    default:
      console.log('ERROR', res.getContentText())
      await findRowByMeetingId(data.udid, 'ERROR', taskId)
  }
  
}

const getMeetings = async () => {
  var today = new Date();
  var events = CalendarApp.getDefaultCalendar().getEventsForDay(today);
  Logger.log(`Total events: ${events.length} , at ${today}`);

  for (let i = 0; i < events.length; i++) {
    // adding common task ids to the title for some common meetings
    var title = titleAdjuster(events[i].getTitle());
    var description = events[i].getDescription();
    var startTime = events[i].getStartTime();
    var endTime = events[i].getEndTime();
    var duration = new Date(endTime).getTime() - new Date(startTime).getTime();
    var udid = events[i].getId();
    // Check whether i am out of office 
    // Or if meeting status is "MAYBE" 
    // Then pass the meeting record
    if (
      title.toLowerCase().includes("ooo")
      || events[i].getMyStatus() == "MAYBE"
      || events[i].getMyStatus() == "NO"
    ) continue;

    var relations = await titleController(title);
    if (!relations) {
      relations = "leanscale"
    };

    var result = [
      title,
      description,
      relations,
      startTime,
      endTime,
      duration, // duration
      duration / 3600000, // convert duration (ms) to hrs
      'Pending', // initial status
      `Automated Timelog`, // tag
      `${title} - Automated Timelog Note`, // time_log_note
      '0',
      udid
    ];

    SpreadsheetApp.getActive().getSheetByName('entries').appendRow(result);

  }
}

// Time log status is optional here to update timelogstatus' value
const findRowByMeetingId = async (id, timeLogStatus, taskID) => {
  try {
    var sheet = SpreadsheetApp.getActive().getSheetByName('entries');
    var indexById = sheet.createTextFinder(id).findNext().getRowIndex();

    if (timeLogStatus) sheet.getRange(`H${indexById}`).setValue(timeLogStatus)
    if (taskID) sheet.getRange(`K${indexById}`).setValue(`https://app.clickup.com/t/${taskID}`)
    
    return {
      "status": true
    }
  } catch (err) {
    Logger.log(err)
    return {
      "status": false
    }
  }
}

const archive = () => {
  var total = 0;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("entries");
  var resultRows = sheet.getLastRow();
  var range = sheet.getDataRange();
  var headers = sheet.getRange(`A1:N1`).getValues();
  for (var i = 2; i <= resultRows; i++) {
    var rowValues = sheet.getRange(`A${i}:N${i}`).getValues();
    // add up all successfull logs
    if (rowValues[0][7] == 'Success') {
      SpreadsheetApp.getActive().getSheetByName('archive').appendRow(rowValues[0])
      total = total + rowValues[0][6]
    } else {
      // if log is not succeeded then keep it still in entries
      headers.push(rowValues[0])
    }
  }
  Logger.log(`Succeeded records have been pushed to archive`)
  range.clearContent();
  headers.forEach(row => SpreadsheetApp.getActive().getSheetByName('entries').appendRow(row))
  notifySlack(total);
}

const notifySlack = (total) => {
  try {
    let text;
    if (total > 0) {
      text = `Total Logged for today is *${total.toString().slice(0,6)}* hrs`
    } else {
      text = `No logging for today`
    }

    var payload = {
      "blocks": [
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": text
          }
        }
      ]
    }

    var options = {
      "method": "post",
      "headers": {
        "Content-type": "application/json",
      },
      "payload": JSON.stringify(payload)
    };
    UrlFetchApp.fetch(SLACK_HOOK, options);
    Logger.log(`Slack notified as ${total} hrs`)
  } catch (e) {
    Logger.log(`Slack notification failed ${e.message}`)
  }
}

const titleController = async (title) => {
  let rawConfig = await CONFIG();
  for (let project of rawConfig) {
    for (let keyword of project.keywords)
      if (title.toLowerCase().includes(keyword)) {
        return project.name;
      }
  }
}

const getConfig = async (prj) => {
  let rawConfig = await CONFIG()
  for (let project of rawConfig) {
    if (prj == project.name) return project
  }
}

const isTaskCreated = async (text, description) => {
  // Try to find Task id and space from the title with regexp
  result = /#([a-zA-Z0-9]+)-([a-zA-Z0-9]+)/.exec(text)

  // if there is no space, try to catch only taskid
  if (result == null) {
    result = /#([a-zA-Z0-9]+)/.exec(text)
  }

  // if there is taskId in the desc, check description for a link
  if (result == null) {
    result = /clickup.com\/t\/([a-zA-Z0-9-]+)/.exec(description)
  }

  // finally, return true or false according to the task id
  if (result == null) return { "status": false }
  return {
      "status": true,
      "task": result[1],
      "space": result[2] ? result[2] : false
    }
}


// If you have common meetings to just handle them
const titleAdjuster = (text) => {
  text = text.toLowerCase();
  if (text == 'devops work block ') return `${text} #123`
  if (text == 'daily - product') return `${text} #123`;
  if (text == 'daily') return `${text} #123`;
  if (text == 'design') return `${text} #123`;
  if (text == 'pm training support weekly') return `${text} #123`;
  if (text == 'ta block') return `${text} #123`;
  if (text == 'seller portal coding') return `${text} #123`;
  if (text == 'accounting') return `${text} #123`;
  return text;
}

